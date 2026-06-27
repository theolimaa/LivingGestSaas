import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { FinancialRecordDB } from './useFinancial';
import { buildReceiptPDF, generateReceiptCode } from '@/lib/generateReceiptPDF';

export interface SavedReceipt {
  id: string;
  user_id: string;
  apartment_id: string;
  tenant_id: string | null;
  contract_id: string | null;
  financial_record_id: string;
  month: string;              // YYYY-MM — período de referência
  payment_date: string | null;
  condominium_name: string;
  apartment_unit: string;
  tenant_name: string;
  receipt_code: string;
  storage_path: string;       // path no Supabase Storage
  public_url: string;         // URL para preview/download
  saved_at: string;
}

const BUCKET = 'receipts';

// ─── Garante que o bucket existe (cria se necessário) ─────────────────────────
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

export function useSavedReceipts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['saved_receipts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_receipts')
        .select('*')
        .eq('user_id', user!.id)          // isolamento por usuário
        .order('saved_at', { ascending: false });
      if (error) throw error;
      return data as SavedReceipt[];
    },
    enabled: !!user,
  });
}

export function useSaveReceipt() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      pdfBytes,
      receiptCode,
      financialRecordId,
      apartmentId,
      tenantId,
      contractId,
      month,
      paymentDate,
      condominiumName,
      apartmentUnit,
      tenantName,
    }: {
      pdfBytes: Uint8Array;
      receiptCode: string;
      financialRecordId: string;
      apartmentId: string;
      tenantId: string | null;
      contractId: string | null;
      month: string;
      paymentDate: string | null;
      condominiumName: string;
      apartmentUnit: string;
      tenantName: string;
    }) => {
      await ensureBucket();

      // Path: {user_id}/{apartment_id}/{month}.pdf
      const storagePath = `${user!.id}/${apartmentId}/${month}.pdf`;
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } =
        await supabase.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
      if (signedError) throw signedError;

      const publicUrl = signedData.signedUrl;

      const { error: dbError } = await supabase
        .from('saved_receipts')
        .upsert(
          {
            user_id: user!.id,             // isolamento por usuário
            apartment_id: apartmentId,
            tenant_id: tenantId,
            contract_id: contractId,
            financial_record_id: financialRecordId,
            month,
            payment_date: paymentDate,
            condominium_name: condominiumName,
            apartment_unit: apartmentUnit,
            tenant_name: tenantName,
            receipt_code: receiptCode,
            storage_path: storagePath,
            public_url: publicUrl,
            saved_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,apartment_id,month' }
        );
      if (dbError) throw dbError;

      return storagePath;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved_receipts'] });
      toast.success('Recibo salvo em Recibos!');
    },
    onError: (e: unknown) => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      console.error('Erro ao salvar recibo:', e);
      toast.error(`Erro ao salvar recibo: ${msg}`, { duration: 10000 });
    },
  });
}

export function useDeleteSavedReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      storagePath,
    }: {
      id: string;
      storagePath: string;
    }) => {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      const { error } = await supabase
        .from('saved_receipts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved_receipts'] });
      toast.success('Recibo excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Gera uma nova signed URL para um recibo existente no storage */
export async function refreshReceiptUrl(
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60); // 1 hora
  if (error) return null;
  return data.signedUrl;
}

/** Remove todos os recibos salvos anteriores a 2026 */
export function useCleanupOldReceipts() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      // Busca todos os recibos antigos
      const { data: old, error } = await supabase
        .from('saved_receipts')
        .select('id, storage_path')
        .eq('user_id', user!.id)          // isolamento por usuário
        .lt('month', '2026-01');
      if (error) throw error;
      if (!old?.length) return 0;

      // Remove do storage
      const paths = old.map(r => r.storage_path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from(BUCKET).remove(paths);
      }

      // Remove do banco
      const ids = old.map(r => r.id);
      const { error: delError } = await supabase
        .from('saved_receipts')
        .delete()
        .in('id', ids);
      if (delError) throw delError;

      return old.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['saved_receipts'] });
      toast.success(`${count} recibo${count !== 1 ? 's' : ''} antigo${count !== 1 ? 's' : ''} removido${count !== 1 ? 's' : ''}!`);
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}


export function useBulkSaveReceipts() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      // 1. Busca registros pagos a partir de 2026 com joins
      const { data: paidRaw, error } = await (supabase as any)
        .from('financial_records')
        .select(
          `
          *,
          apartments!inner(id, unit_number, condominium_id, condominiums!inner(name)),
          tenants(id, first_name, last_name, cpf),
          contracts(id, payment_day, start_date, caution_paid, caution_value, caution_date)
        `
        )
        .eq('paid', true)
        .gte('month', '2026-01'); // Apenas 2026 em diante

      if (error) throw new Error(error.message);
      if (!paidRaw?.length) return { saved: 0, skipped: 0 };

      // 2. Busca registros financeiros do usuário para montar o histórico anual
      const { data: allRec } = await supabase
        .from('financial_records')
        .select('*, apartments!inner(condominiums!inner(user_id))')
        .eq('apartments.condominiums.user_id', user!.id)
        .order('month', { ascending: true })
        .limit(50000);

      const byApartment: Record<string, FinancialRecordDB[]> = {};
      for (const r of allRec || []) {
        if (!byApartment[r.apartment_id]) byApartment[r.apartment_id] = [];
        byApartment[r.apartment_id].push(r);
      }

      // 3. Verifica quais já existem para não duplicar
      const { data: existing } = await supabase
        .from('saved_receipts')
        .select('apartment_id, month')
        .eq('user_id', user!.id);         // isolamento por usuário
      const existingSet = new Set(
        (existing || []).map(e => `${e.apartment_id}||${e.month}`)
      );

      await ensureBucket();

      const adminName =
        user?.user_metadata?.username ||
        user?.email?.split('@')[0] ||
        'Administrador';

      let saved = 0;
      let skipped = 0;

      for (const r of paidRaw as any[]) {
        const apt = r.apartments;
        const ten = r.tenants;
        const con = r.contracts;
        const condoName: string = apt?.condominiums?.name || '';

        // Pula registros incompletos
        if (!apt || !ten || !condoName) {
          skipped++;
          continue;
        }

        // Pula se já existe (não sobrescreve automaticamente)
        const key = `${r.apartment_id}||${r.month}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }

        try {
          const apartmentRecords = byApartment[r.apartment_id] || [];

          const pdfBytes = buildReceiptPDF({
            record: r as FinancialRecordDB,
            apartmentUnit: apt.unit_number,
            condominiumName: condoName,
            tenantFirstName: ten.first_name,
            tenantLastName: ten.last_name,
            tenantCpf: ten.cpf,
            contractPaymentDay: con?.payment_day,
            contractStartDate: con?.start_date,
            contractCautionPaid: con?.caution_paid,
            contractCautionValue: con?.caution_value,
            contractCautionDate: con?.caution_date,
            allYearRecords: apartmentRecords,
            adminName,
          });

          const receiptCode = generateReceiptCode(
            condoName,
            apt.unit_number,
            con?.start_date
          );
          const storagePath = `${user!.id}/${r.apartment_id}/${r.month}.pdf`;

          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          await supabase.storage
            .from(BUCKET)
            .upload(storagePath, blob, {
              contentType: 'application/pdf',
              upsert: true,
            });

          const { data: signedData } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

          await supabase.from('saved_receipts').upsert(
            {
              user_id: user!.id,           // isolamento por usuário
              apartment_id: r.apartment_id,
              tenant_id: ten.id,
              contract_id: r.contract_id,
              financial_record_id: r.id,
              month: r.month,
              payment_date: r.payment_date,
              condominium_name: condoName,
              apartment_unit: apt.unit_number,
              tenant_name: `${ten.first_name} ${ten.last_name}`,
              receipt_code: receiptCode,
              storage_path: storagePath,
              public_url: signedData?.signedUrl || '',
              saved_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,apartment_id,month' }
          );

          saved++;
        } catch (err) {
          console.error('Erro ao salvar recibo em lote:', err);
          skipped++;
        }
      }

      return { saved, skipped };
    },
    onSuccess: ({ saved, skipped }) => {
      qc.invalidateQueries({ queryKey: ['saved_receipts'] });
      if (saved === 0) {
        toast.info(
          skipped > 0
            ? `Todos os ${skipped} recibos já estavam salvos.`
            : 'Nenhum recibo pago encontrado.'
        );
      } else {
        toast.success(
          `${saved} recibo${saved !== 1 ? 's' : ''} salvo${saved !== 1 ? 's' : ''}!${
            skipped > 0 ? ` (${skipped} já existiam)` : ''
          }`
        );
      }
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
