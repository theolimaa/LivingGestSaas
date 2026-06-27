import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ApartmentDB {
  id: string;
  condominium_id: string;
  unit_number: string;
  created_at: string | null;
}

export function useApartments(condominiumId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['apartments', condominiumId],
    queryFn: async () => {
      let query = supabase.from('apartments').select('*').order('unit_number');
      if (condominiumId) query = query.eq('condominium_id', condominiumId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ApartmentDB[];
    },
    enabled: !!user,
  });
}

export function useApartment(id: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['apartment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apartments')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as ApartmentDB;
    },
    enabled: !!user && !!id,
  });
}

export function useAddApartment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ condominium_id, unit_number }: { condominium_id: string; unit_number: string }) => {
      const { data, error } = await supabase
        .from('apartments')
        .insert({ condominium_id, unit_number })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['apartments', vars.condominium_id] });
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Apartamento adicionado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateApartment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, unit_number }: { id: string; unit_number: string }) => {
      const { error } = await supabase
        .from('apartments')
        .update({ unit_number })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Apartamento atualizado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteApartment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('apartments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apartments'] });
      toast.success('Apartamento excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
