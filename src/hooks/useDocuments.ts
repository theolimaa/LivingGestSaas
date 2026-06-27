import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface DocumentDB {
  id: string;
  tenant_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
}

const BUCKET = 'tenant-documents';
const PUBLIC_PATTERN = `/storage/v1/object/public/${BUCKET}/`;

/** Extrai o caminho relativo do arquivo dentro do bucket a partir da public URL. */
export function getDocumentStoragePath(fileUrl: string): string | null {
  const idx = fileUrl.indexOf(PUBLIC_PATTERN);
  if (idx === -1) return null;
  return decodeURIComponent(fileUrl.slice(idx + PUBLIC_PATTERN.length));
}

/** Abre o documento usando uma URL assinada (funciona com buckets públicos e privados). */
export async function openDocumentSigned(fileUrl: string): Promise<void> {
  const path = getDocumentStoragePath(fileUrl);
  if (!path) {
    window.open(fileUrl, '_blank');
    return;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error(`Erro ao abrir documento: ${error?.message ?? 'URL inválida'}`);
    return;
  }
  window.open(data.signedUrl, '_blank');
}

/** Baixa os bytes de um documento do Supabase Storage via URL assinada. */
export async function fetchDocumentBytes(
  fileUrl: string
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const path = getDocumentStoragePath(fileUrl);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
  } catch {
    return null;
  }
}

/** Documentos de um inquilino específico. */
export function useDocuments(tenantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['documents', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as DocumentDB[];
    },
    enabled: !!user && !!tenantId,
  });
}

/** Todos os documentos de todos os inquilinos (para a página de backup). */
export function useAllDocuments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['documents_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, tenants!inner(apartments!inner(condominiums!inner(user_id)))')
        .eq('condominiums.user_id', user!.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as DocumentDB[];
    },
    enabled: !!user,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, tenantId }: { file: File; tenantId: string }) => {
      const ext = file.name.split('.').pop();
      const path = `${tenantId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data, error } = await supabase
        .from('documents')
        .insert({
          tenant_id: tenantId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type.includes('pdf')
            ? 'pdf'
            : file.type.includes('image')
            ? 'image'
            : 'other',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['documents', data.tenant_id] });
      qc.invalidateQueries({ queryKey: ['documents_all'] });
      toast.success('Documento enviado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      tenantId,
      fileUrl,
    }: {
      id: string;
      tenantId: string;
      fileUrl?: string;
    }) => {
      if (fileUrl) {
        const path = getDocumentStoragePath(fileUrl);
        if (path) {
          await supabase.storage.from(BUCKET).remove([path]);
        }
      }
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => {
      qc.invalidateQueries({ queryKey: ['documents', tenantId] });
      qc.invalidateQueries({ queryKey: ['documents_all'] });
      toast.success('Documento excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
