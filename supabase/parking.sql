-- ============================================================
-- ESTACIONAMENTO — Condomínio Conectado
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- Configuração por condomínio: quantidade de vagas, tamanho da vaga e campos extras personalizados
create table if not exists public.parking_settings (
  condominium_id uuid primary key references public.condominiums(id) on delete cascade,
  car_spots integer not null default 0,
  moto_spots integer not null default 0,
  spot_length numeric,
  spot_width numeric,
  spot_ranges jsonb not null default '[]'::jsonb, -- [{ "from": 1, "to": 5, "type": "moto|car" }]
  custom_fields jsonb not null default '[]'::jsonb, -- [{ "key": "...", "label": "...", "type": "text|number|yesno" }]
  updated_at timestamptz not null default now()
);

-- Um registro por veículo (um apartamento pode ter vários)
create table if not exists public.parking_vehicles (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete cascade,
  vehicle_type text not null default 'car' check (vehicle_type in ('car','moto','other')),
  model text,
  plate text,
  color text,
  length_m numeric,
  width_m numeric,
  spot_number text,
  notes text,
  extra jsonb not null default '{}'::jsonb, -- valores dos campos personalizados, por key
  created_at timestamptz not null default now()
);
create index if not exists parking_vehicles_condominium_idx on public.parking_vehicles(condominium_id);
create index if not exists parking_vehicles_apartment_idx on public.parking_vehicles(apartment_id);

alter table public.parking_settings enable row level security;
alter table public.parking_vehicles enable row level security;

create policy "parking_settings_select" on public.parking_settings for select
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_settings_insert" on public.parking_settings for insert
  with check (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_settings_update" on public.parking_settings for update
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_settings_delete" on public.parking_settings for delete
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));

create policy "parking_vehicles_select" on public.parking_vehicles for select
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_vehicles_insert" on public.parking_vehicles for insert
  with check (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_vehicles_update" on public.parking_vehicles for update
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
create policy "parking_vehicles_delete" on public.parking_vehicles for delete
  using (exists (select 1 from public.condominiums c where c.id = condominium_id and c.user_id = auth.uid()));
