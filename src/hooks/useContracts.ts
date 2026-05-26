import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ContractDB {
  id: string;
  tenant_id: string;
  start_date: string;
  end_date: string | null;
  payment_day: number | null;
  desired_payment_day: number | null;
  desired_payment_date: string | null;
  rent_value: number;
  observations: string | null;
  status: string | null;
  // Campos de caução
  caution_paid: boolean | null;
  caution_value: number | null;
  caution_date: string | null;
  created_at: string;
  updated_at: string;
}

export function useContract(tenantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['contract', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data as ContractDB | null;
    },
    enabled: !!user && !!tenantId,
  });
}

export function useContracts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['contracts_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ContractDB[];
    },
    enabled: !!user,
  });
}

export function useUpsertContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contract: Omit<ContractDB, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
      if (contract.id) {
        const { id, ...updates } = contract;
        const { data, error } = await supabase
          .from('contracts')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data as ContractDB;
      } else {
        const { id: _id, ...insertData } = contract as ContractDB;
        const { data, error } = await supabase
          .from('contracts')
          .insert(insertData)
          .select()
          .single();
        if (error) throw error;
        return data as ContractDB;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['contract', data.tenant_id] });
      qc.invalidateQueries({ queryKey: ['contracts_all'] });
      toast.success('Contrato salvo!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Encerramento de contrato com SOFT-DELETE:
 *
 * Em vez de deletar o inquilino (o que apagaria documentos e contratos),
 * marcamos archived_at no registro do inquilino. Todos os dados ficam
 * intactos e linkados via tenant_id para a aba "Anteriores".
 *
 * Fluxo:
 * 1. Atualiza contrato → status 'ended', end_date
 * 2. Marca inquilino como arquivado (archived_at = now)
 * 3. Registra em previous_tenants (para a listagem na aba Anteriores)
 * 4. Registros financeiros futuros (não pagos) ficam preservados no histórico
 * 5. Invalida queries para o apartamento aparecer como "Vago"
 */
export function useCloseContract() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contractId,
      tenantId,
      apartmentId,
      endDate,
    }: {
      contractId: string;
      tenantId: string;
      apartmentId: string;
      endDate: string;
    }) => {
      // 1. Buscar dados do inquilino
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
      if (tenantErr) throw tenantErr;
      if (!tenant) throw new Error('Inquilino não encontrado');

      // 2a. Buscar dados do contrato para cálculo proporcional
      const { data: contractData } = await supabase
        .from('contracts')
        .select('payment_day, rent_value')
        .eq('id', contractId)
        .single();

      // 2b. Marcar contrato como encerrado (mantém na tabela para histórico)
      const { error: contractErr } = await supabase
        .from('contracts')
        .update({ status: 'ended', end_date: endDate })
        .eq('id', contractId);
      if (contractErr) throw contractErr;

      // 3. Deletar registros financeiros NÃO PAGOS com month APÓS o encerramento.
      //    Registros pagos e do mês de encerramento são preservados no histórico.
      const endMonth = endDate.substring(0, 7); // YYYY-MM
      const { error: deleteRecordsErr } = await supabase
        .from('financial_records')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('paid', false)
        .gt('month', endMonth); // registros futuros apenas
      if (deleteRecordsErr) throw deleteRecordsErr;

      // 3b. Para período parcial: atualizar o último registro com valor proporcional
      //     Se não existir, criar um novo registro com o valor proporcional
      const payDay = contractData?.payment_day ?? 1;
      const endD = new Date(endDate + 'T12:00:00');
      let pStart = new Date(endD.getFullYear(), endD.getMonth(), payDay);
      if (pStart > endD) pStart = new Date(endD.getFullYear(), endD.getMonth() - 1, payDay);
      const pEnd = new Date(pStart.getFullYear(), pStart.getMonth() + 1, payDay);
      const periodDays = Math.round((pEnd.getTime() - pStart.getTime()) / 86400000);
      const daysStayed = Math.round((endD.getTime() - pStart.getTime()) / 86400000) + 1;
      const isPartial = daysStayed < periodDays;

      if (isPartial && contractData?.rent_value) {
        const proportional = Math.round((contractData.rent_value * daysStayed / periodDays) * 100) / 100;
        // Tenta atualizar registro existente não pago do mês de encerramento
        const { data: existingRec } = await supabase
          .from('financial_records')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('month', endMonth)
          .eq('paid', false)
          .maybeSingle();

        if (existingRec) {
          // Atualiza valor para proporcional
          await supabase
            .from('financial_records')
            .update({ rent_value: proportional })
            .eq('id', existingRec.id);
        } else {
          // Cria registro proporcional (período parcial não pago)
          await supabase
            .from('financial_records')
            .insert({
              apartment_id: apartmentId,
              tenant_id: tenantId,
              contract_id: contractId,
              month: endMonth,
              rent_value: proportional,
              paid: false,
              status: 'Pendente',
            });
        }
      }

      // 4. Soft-delete do inquilino: apenas marca archived_at
      //    Os documentos, contrato e registros financeiros continuam linkados
      //    via tenant_id para a aba "Anteriores" usar
      const archivedAt = new Date().toISOString();
      const { error: archiveErr } = await supabase
        .from('tenants')
        .update({ archived_at: archivedAt })
        .eq('id', tenantId);
      if (archiveErr) throw archiveErr;

      // 5. Registrar em previous_tenants para a listagem
      //    original_id aponta para tenants.id → usado para buscar docs/contrato
      const { data: prevTenant, error: prevErr } = await supabase.from('previous_tenants').insert({
        first_name: tenant.first_name,
        last_name: tenant.last_name,
        cpf: tenant.cpf,
        email: tenant.email,
        phone: tenant.phone,
        birth_date: tenant.birth_date,
        apartment_id: apartmentId,
        original_id: tenantId,
        archived_at: archivedAt,
      }).select().single();
      if (prevErr) throw prevErr;

      return { apartmentId, tenantId, contractId, prevTenantId: prevTenant.id };
    },

    onSuccess: ({ apartmentId, tenantId }) => {
      qc.invalidateQueries({ queryKey: ['tenants', apartmentId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['contract', tenantId] });
      qc.invalidateQueries({ queryKey: ['contracts_all'] });
      qc.invalidateQueries({ queryKey: ['previous_tenants', apartmentId] });
      qc.invalidateQueries({ queryKey: ['previous_tenants'] });
      qc.invalidateQueries({ queryKey: ['financial_records', apartmentId] });
      qc.invalidateQueries({ queryKey: ['financial_records_all'] });
      qc.invalidateQueries({ queryKey: ['apartments', apartmentId] });
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Contrato encerrado! Inquilino movido para histórico.');
    },
    onError: (e: Error) => toast.error(`Erro ao encerrar contrato: ${e.message}`),
  });
}

/**
 * Desfaz o encerramento de contrato:
 * 1. Restaura o contrato para status 'active', remove end_date
 * 2. Remove o registro de previous_tenants
 * 3. Restaura o inquilino (remove archived_at)
 */
export function useUndoCloseContract() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contractId,
      tenantId,
      prevTenantId,
      apartmentId,
    }: {
      contractId: string;
      tenantId: string;
      prevTenantId: string;
      apartmentId: string;
    }) => {
      // 1. Restaurar contrato
      const { error: contractErr } = await supabase
        .from('contracts')
        .update({ status: 'active', end_date: null })
        .eq('id', contractId);
      if (contractErr) throw contractErr;

      // 2. Remover de previous_tenants
      const { error: prevErr } = await supabase
        .from('previous_tenants')
        .delete()
        .eq('id', prevTenantId);
      if (prevErr) throw prevErr;

      // 3. Restaurar inquilino (remove archived_at)
      const { error: tenantErr } = await supabase
        .from('tenants')
        .update({ archived_at: null })
        .eq('id', tenantId);
      if (tenantErr) throw tenantErr;

      return { apartmentId, tenantId, contractId };
    },

    onSuccess: ({ apartmentId, tenantId }) => {
      qc.invalidateQueries({ queryKey: ['tenants', apartmentId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['contract', tenantId] });
      qc.invalidateQueries({ queryKey: ['contracts_all'] });
      qc.invalidateQueries({ queryKey: ['previous_tenants', apartmentId] });
      qc.invalidateQueries({ queryKey: ['previous_tenants'] });
      qc.invalidateQueries({ queryKey: ['financial_records', apartmentId] });
      qc.invalidateQueries({ queryKey: ['apartments', apartmentId] });
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Encerramento desfeito! Contrato reativado.');
    },
    onError: (e: Error) => toast.error(`Erro ao desfazer encerramento: ${e.message}`),
  });
}
