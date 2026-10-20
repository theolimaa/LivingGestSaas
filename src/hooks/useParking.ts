import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type VehicleType = 'car' | 'moto' | 'other';
export type CustomFieldType = 'text' | 'number' | 'yesno';

export interface ParkingCustomField {
  key: string;
  label: string;
  type: CustomFieldType;
}

export interface ParkingSettingsDB {
  condominium_id: string;
  car_spots: number;
  moto_spots: number;
  spot_length: number | null;
  spot_width: number | null;
  custom_fields: ParkingCustomField[];
}

export interface ParkingVehicleDB {
  id: string;
  condominium_id: string;
  apartment_id: string | null;
  vehicle_type: VehicleType;
  model: string | null;
  plate: string | null;
  color: string | null;
  length_m: number | null;
  width_m: number | null;
  spot_number: string | null;
  notes: string | null;
  extra: Record<string, string | number | boolean | null>;
  created_at: string;
}

export type ParkingVehicleInput = Omit<ParkingVehicleDB, 'id' | 'created_at'>;

export const DEFAULT_PARKING_SETTINGS = (condominiumId: string): ParkingSettingsDB => ({
  condominium_id: condominiumId,
  car_spots: 0,
  moto_spots: 0,
  spot_length: null,
  spot_width: null,
  custom_fields: [],
});

export function useParkingSettings(condominiumId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['parking_settings', condominiumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parking_settings')
        .select('*')
        .eq('condominium_id', condominiumId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PARKING_SETTINGS(condominiumId!);
      return {
        ...data,
        custom_fields: Array.isArray(data.custom_fields) ? (data.custom_fields as unknown as ParkingCustomField[]) : [],
      } as ParkingSettingsDB;
    },
    enabled: !!user && !!condominiumId,
  });
}

export function useSaveParkingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: ParkingSettingsDB) => {
      const { error } = await supabase
        .from('parking_settings')
        .upsert({ ...s, custom_fields: s.custom_fields as unknown as never, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ['parking_settings', s.condominium_id] });
      toast.success('Configurações salvas!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useParkingVehicles(condominiumId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['parking_vehicles', condominiumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parking_vehicles')
        .select('*')
        .eq('condominium_id', condominiumId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map(v => ({
        ...v,
        extra: (v.extra && typeof v.extra === 'object' && !Array.isArray(v.extra) ? v.extra : {}) as ParkingVehicleDB['extra'],
      })) as ParkingVehicleDB[];
    },
    enabled: !!user && !!condominiumId,
  });
}

export function useSaveParkingVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ParkingVehicleDB> & ParkingVehicleInput) => {
      const payload = { ...input, extra: input.extra as unknown as never };
      const { error } = id
        ? await supabase.from('parking_vehicles').update(payload).eq('id', id)
        : await supabase.from('parking_vehicles').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['parking_vehicles', v.condominium_id] });
      toast.success(v.id ? 'Veículo atualizado!' : 'Veículo adicionado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteParkingVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; condominium_id: string }) => {
      const { error } = await supabase.from('parking_vehicles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['parking_vehicles', v.condominium_id] });
      toast.success('Veículo removido!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
