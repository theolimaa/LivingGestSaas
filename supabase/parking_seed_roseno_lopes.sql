-- ============================================================
-- IMPORTAÇÃO — planilha "ESTACIONAMENTO - VEÍCULOS.xlsx" (Roseno Lopes)
-- Rode DEPOIS de parking.sql. Apartamentos vinculados pelo unit_number (ex.: "NUM. 10 AP 02" -> "10-2").
-- Apartamentos marcados XXX na planilha (sem veículo) não geram registro.
-- ============================================================

insert into public.parking_settings (condominium_id, car_spots, moto_spots, spot_length, spot_width, spot_ranges)
select id, 9, 5, 5.00, 2.20, '[{"from":1,"to":5,"type":"moto"},{"from":6,"to":14,"type":"car"}]'::jsonb from public.condominiums where name = 'Roseno Lopes'
on conflict (condominium_id) do update
  set car_spots = excluded.car_spots, moto_spots = excluded.moto_spots,
      spot_length = excluded.spot_length, spot_width = excluded.spot_width,
      spot_ranges = excluded.spot_ranges, updated_at = now();

with cond as (select id from public.condominiums where name = 'Roseno Lopes'),
v(unit, vtype, model, plate, color, len, wid, spot) as (values
  ('10-2',  'car',  'VW Fox',           'NQQ2H89',  'Vermelha',       null::numeric, null::numeric, '9'),
  ('10-2',  'moto', 'Honda Pop',        'GGU8H04',  'Preta',          null, null, '9'),
  ('10-3',  'car',  'Voyage',           'POX-0529', 'Branca',         null, null, '14'),
  ('10-4',  'car',  'Renault Sandero',  'OIB6J75',  'Preta',          null, null, '7'),
  ('10-5',  'car',  'Tracker 2025',     'THR4A35',  'Cinza grafite',  null, null, '8'),
  ('980-1', 'car',  'Onix',             'OZA-9700', 'Azul',           3.93, 1.70, '6'),
  ('980-1', 'moto', 'Honda',            'OSG-8510', 'Vermelha',       null, null, '6'),
  ('980-2', 'car',  'Sandero',          'NUY-1D96', 'Preta',          3.92, 1.68, '10'),
  ('980-2', 'moto', 'Honda',            '0HY-5721', 'Vermelha',       null, null, '2'),
  ('980-3', 'moto', 'Mottu Sport 110i', 'TBB4J88',  'Preta',          null, null, '3')
)
insert into public.parking_vehicles (condominium_id, apartment_id, vehicle_type, model, plate, color, length_m, width_m, spot_number)
select cond.id, a.id, v.vtype, v.model, v.plate, v.color, v.len, v.wid, v.spot
from v
cross join cond
join public.apartments a on a.condominium_id = cond.id and a.unit_number = v.unit;
-- Esperado: 10 linhas (6 carros + 4 motos)
