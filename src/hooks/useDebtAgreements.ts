import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface DebtAgreement {
  id: string;
  previous_tenant_id: string;
  apartment_id: string;
  original_amount: number;
  agreed_amount: number;
  installment_count: number;
  installment_value: number;
  notes: string | null;
  status: 'active' | 'settled' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface DebtInstallment {
  id: string;
  agreement_id: string;
  installment_number: number;
  amount: number;
  due_date: string | null;
  paid: boolean;
  payment_date: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export function useDebtAgreements(previousTenantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['debt_agreements', previousTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_agreements')
        .select('*')
        .eq('previous_tenant_id', previousTenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DebtAgreement[];
    },
    enabled: !!user && !!previousTenantId,
  });
}

export function useDebtInstallments(agreementId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['debt_installments', agreementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*')
        .eq('agreement_id', agreementId)
        .order('installment_number', { ascending: true });
      if (error) throw error;
      return data as DebtInstallment[];
    },
    enabled: !!user && !!agreementId,
  });
}

export function useCreateDebtAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      previousTenantId,
      apartmentId,
      originalAmount,
      agreedAmount,
      installmentCount,
      installmentValue,
      notes,
      startDate,
    }: {
      previousTenantId: string;
      apartmentId: string;
      originalAmount: number;
      agreedAmount: number;
      installmentCount: number;
      installmentValue: number;
      notes: string;
      startDate: string; // YYYY-MM-DD — data da primeira parcela
    }) => {
      // 1. Criar o acordo
      const { data: agreement, error: agErr } = await supabase
        .from('debt_agreements')
        .insert({
          previous_tenant_id: previousTenantId,
          apartment_id: apartmentId,
          original_amount: originalAmount,
          agreed_amount: agreedAmount,
          installment_count: installmentCount,
          installment_value: installmentValue,
          notes: notes || null,
          status: 'active',
        })
        .select()
        .single();
      if (agErr) throw agErr;

      // 2. Gerar parcelas
      const installments = Array.from({ length: installmentCount }, (_, i) => {
        const due = new Date(startDate + 'T12:00:00');
        due.setMonth(due.getMonth() + i);
        return {
          agreement_id: agreement.id,
          installment_number: i + 1,
          amount: installmentValue,
          due_date: due.toISOString().split('T')[0],
          paid: false,
        };
      });

      const { error: instErr } = await supabase
        .from('debt_installments')
        .insert(installments);
      if (instErr) throw instErr;

      return agreement as DebtAgreement;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['debt_agreements', data.previous_tenant_id] });
      toast.success('Acordo de dívida criado!');
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      toast.error(`Erro: ${msg}`, { duration: 10000 });
    },
  });
}

export function useUpdateDebtAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      previousTenantId,
      ...updates
    }: Partial<DebtAgreement> & { id: string; previousTenantId: string }) => {
      const { error } = await supabase
        .from('debt_agreements')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return { id, previousTenantId };
    },
    onSuccess: ({ previousTenantId }) => {
      qc.invalidateQueries({ queryKey: ['debt_agreements', previousTenantId] });
      toast.success('Acordo atualizado!');
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      toast.error(`Erro: ${msg}`, { duration: 10000 });
    },
  });
}

export function usePayInstallment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      agreementId,
      previousTenantId,
      paymentDate,
      paymentMethod,
      // Check if all installments paid → auto-settle agreement
      allPaidAfterThis,
    }: {
      installmentId: string;
      agreementId: string;
      previousTenantId: string;
      paymentDate: string;
      paymentMethod: string;
      allPaidAfterThis: boolean;
    }) => {
      const { error: instErr } = await supabase
        .from('debt_installments')
        .update({ paid: true, payment_date: paymentDate, payment_method: paymentMethod })
        .eq('id', installmentId);
      if (instErr) throw instErr;

      if (allPaidAfterThis) {
        await supabase
          .from('debt_agreements')
          .update({ status: 'settled', updated_at: new Date().toISOString() })
          .eq('id', agreementId);
      }

      return { agreementId, previousTenantId };
    },
    onSuccess: ({ agreementId, previousTenantId }) => {
      qc.invalidateQueries({ queryKey: ['debt_installments', agreementId] });
      qc.invalidateQueries({ queryKey: ['debt_agreements', previousTenantId] });
      toast.success('Parcela registrada!');
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      toast.error(`Erro: ${msg}`, { duration: 10000 });
    },
  });
}

export function useUnpayInstallment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      agreementId,
      previousTenantId,
    }: {
      installmentId: string;
      agreementId: string;
      previousTenantId: string;
    }) => {
      const { error } = await supabase
        .from('debt_installments')
        .update({ paid: false, payment_date: null, payment_method: null })
        .eq('id', installmentId);
      if (error) throw error;
      // Reactivate agreement if it was settled
      await supabase
        .from('debt_agreements')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', agreementId)
        .eq('status', 'settled');
      return { agreementId, previousTenantId };
    },
    onSuccess: ({ agreementId, previousTenantId }) => {
      qc.invalidateQueries({ queryKey: ['debt_installments', agreementId] });
      qc.invalidateQueries({ queryKey: ['debt_agreements', previousTenantId] });
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      toast.error(`Erro: ${msg}`);
    },
  });
}

export function useCancelDebtAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, previousTenantId }: { id: string; previousTenantId: string }) => {
      const { error } = await supabase
        .from('debt_agreements')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return previousTenantId;
    },
    onSuccess: (previousTenantId) => {
      qc.invalidateQueries({ queryKey: ['debt_agreements', previousTenantId] });
      toast.success('Acordo cancelado.');
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      toast.error(`Erro: ${msg}`);
    },
  });
}

export function useAllDebtAgreements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['debt_agreements_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_agreements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DebtAgreement[];
    },
    enabled: !!user,
  });
}

export function useAllDebtInstallments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['debt_installments_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*, debt_agreements(previous_tenant_id, apartment_id)')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data as (DebtInstallment & { debt_agreements: { previous_tenant_id: string; apartment_id: string } })[];
    },
    enabled: !!user,
  });
}
