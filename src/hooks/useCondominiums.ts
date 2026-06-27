import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface CondominiumDB {
  id: string;
  name: string;
  user_id: string;
  created_at: string | null;
}

export function useCondominiums() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['condominiums', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('condominiums')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as CondominiumDB[];
    },
    enabled: !!user,
  });
}

export function useAddCondominium() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('condominiums')
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['condominiums'] });
      toast.success('Condomínio adicionado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCondominium() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('condominiums')
        .update({ name })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['condominiums'] });
      toast.success('Condomínio atualizado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCondominium() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('condominiums').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['condominiums'] });
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Condomínio excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
