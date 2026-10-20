import { useMemo, useState } from 'react';
import { Car, Bike, Plus, Pencil, Trash2, Search, X, Settings2, ParkingSquare, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApartmentDB } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import {
  ParkingCustomField,
  ParkingSettingsDB,
  ParkingVehicleDB,
  VehicleType,
  useDeleteParkingVehicle,
  useParkingSettings,
  useParkingVehicles,
  useSaveParkingSettings,
  useSaveParkingVehicle,
} from '@/hooks/useParking';

const TYPE_LABEL: Record<VehicleType, string> = { car: 'Carro', moto: 'Moto', other: 'Outro' };
const NO_APT = 'none';

function fmtNum(n: number | null | undefined) {
  return n == null ? '' : String(n).replace('.', ',');
}
function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function fmtExtra(f: ParkingCustomField, v: unknown) {
  if (v === undefined || v === null || v === '') return '—';
  if (f.type === 'yesno') return v ? 'Sim' : 'Não';
  return String(v);
}

/* ---------------------------- Modal de veículo ---------------------------- */

function VehicleModal({
  open,
  onClose,
  condominiumId,
  apartments,
  settings,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  condominiumId: string;
  apartments: ApartmentDB[];
  settings: ParkingSettingsDB;
  initial?: ParkingVehicleDB;
}) {
  const save = useSaveParkingVehicle();
  const [type, setType] = useState<VehicleType>(initial?.vehicle_type ?? 'car');
  const [apartmentId, setApartmentId] = useState(initial?.apartment_id ?? NO_APT);
  const [model, setModel] = useState(initial?.model ?? '');
  const [plate, setPlate] = useState(initial?.plate ?? '');
  const [color, setColor] = useState(initial?.color ?? '');
  const [length, setLength] = useState(fmtNum(initial?.length_m));
  const [width, setWidth] = useState(fmtNum(initial?.width_m));
  const [spot, setSpot] = useState(initial?.spot_number ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [extra, setExtra] = useState<ParkingVehicleDB['extra']>(initial?.extra ?? {});

  async function handleSave() {
    await save.mutateAsync({
      id: initial?.id,
      condominium_id: condominiumId,
      apartment_id: apartmentId === NO_APT ? null : apartmentId,
      vehicle_type: type,
      model: model.trim() || null,
      plate: plate.trim().toUpperCase() || null,
      color: color.trim() || null,
      length_m: parseNum(length),
      width_m: parseNum(width),
      spot_number: spot.trim() || null,
      notes: notes.trim() || null,
      extra,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={v => setType(v as VehicleType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="car">Carro</SelectItem>
                <SelectItem value="moto">Moto</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Apartamento</Label>
            <Select value={apartmentId} onValueChange={setApartmentId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_APT}>Sem apartamento</SelectItem>
                {apartments.map(a => (
                  <SelectItem key={a.id} value={a.id}>Apto {a.unit_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Modelo</Label>
            <Input className="mt-1" value={model} onChange={e => setModel(e.target.value)} placeholder="Onix" />
          </div>
          <div>
            <Label>Placa</Label>
            <Input className="mt-1" value={plate} onChange={e => setPlate(e.target.value)} placeholder="ABC-1D23" />
          </div>
          <div>
            <Label>Cor</Label>
            <Input className="mt-1" value={color} onChange={e => setColor(e.target.value)} />
          </div>
          <div>
            <Label>Nº da vaga</Label>
            <Input className="mt-1" value={spot} onChange={e => setSpot(e.target.value)} />
          </div>
          {type !== 'moto' && (
            <>
              <div>
                <Label>Comprimento (m)</Label>
                <Input className="mt-1" inputMode="decimal" value={length} onChange={e => setLength(e.target.value)} placeholder="3,93" />
              </div>
              <div>
                <Label>Largura (m)</Label>
                <Input className="mt-1" inputMode="decimal" value={width} onChange={e => setWidth(e.target.value)} placeholder="1,70" />
              </div>
            </>
          )}
          {settings.custom_fields.map(f => (
            <div key={f.key} className={f.type === 'text' ? 'col-span-2' : ''}>
              <Label>{f.label}</Label>
              {f.type === 'yesno' ? (
                <Select
                  value={extra[f.key] === true ? 'yes' : extra[f.key] === false ? 'no' : NO_APT}
                  onValueChange={v => setExtra({ ...extra, [f.key]: v === 'yes' ? true : v === 'no' ? false : null })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_APT}>—</SelectItem>
                    <SelectItem value="yes">Sim</SelectItem>
                    <SelectItem value="no">Não</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="mt-1"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={(extra[f.key] as string | number | null | undefined) ?? ''}
                  onChange={e =>
                    setExtra({ ...extra, [f.key]: e.target.value === '' ? null : f.type === 'number' ? Number(e.target.value) : e.target.value })
                  }
                />
              )}
            </div>
          ))}
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={save.isPending}>{initial ? 'Salvar' : 'Adicionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- Modal de configurações ------------------------- */

function SettingsModal({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: ParkingSettingsDB;
}) {
  const save = useSaveParkingSettings();
  const [carSpots, setCarSpots] = useState(String(settings.car_spots));
  const [motoSpots, setMotoSpots] = useState(String(settings.moto_spots));
  const [spotLength, setSpotLength] = useState(fmtNum(settings.spot_length));
  const [spotWidth, setSpotWidth] = useState(fmtNum(settings.spot_width));
  const [fields, setFields] = useState<ParkingCustomField[]>(settings.custom_fields);

  function addField() {
    setFields([...fields, { key: `f_${Date.now().toString(36)}`, label: '', type: 'text' }]);
  }

  async function handleSave() {
    await save.mutateAsync({
      condominium_id: settings.condominium_id,
      car_spots: Math.max(0, parseInt(carSpots) || 0),
      moto_spots: Math.max(0, parseInt(motoSpots) || 0),
      spot_length: parseNum(spotLength),
      spot_width: parseNum(spotWidth),
      custom_fields: fields.filter(f => f.label.trim()).map(f => ({ ...f, label: f.label.trim() })),
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar estacionamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vagas de carro</Label>
              <Input className="mt-1" type="number" min={0} value={carSpots} onChange={e => setCarSpots(e.target.value)} />
            </div>
            <div>
              <Label>Vagas de moto</Label>
              <Input className="mt-1" type="number" min={0} value={motoSpots} onChange={e => setMotoSpots(e.target.value)} />
            </div>
            <div>
              <Label>Comprimento da vaga (m)</Label>
              <Input className="mt-1" inputMode="decimal" value={spotLength} onChange={e => setSpotLength(e.target.value)} placeholder="5,00" />
            </div>
            <div>
              <Label>Largura da vaga (m)</Label>
              <Input className="mt-1" inputMode="decimal" value={spotWidth} onChange={e => setSpotWidth(e.target.value)} placeholder="2,20" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label>Campos personalizados</Label>
                <p className="text-xs text-muted-foreground">Colunas extras que aparecem no cadastro e na tabela deste condomínio.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addField}>
                <Plus className="w-3 h-3" /> Campo
              </Button>
            </div>
            {fields.length === 0 && <p className="text-sm text-muted-foreground">Nenhum campo extra.</p>}
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.key} className="flex items-center gap-2">
                  <Input
                    value={f.label}
                    placeholder="Nome do campo (ex.: Adesivo)"
                    onChange={e => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Select
                    value={f.type}
                    onValueChange={v => setFields(fields.map((x, j) => (j === i ? { ...x, type: v as ParkingCustomField['type'] } : x)))}
                  >
                    <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="yesno">Sim/Não</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setFields(fields.filter((_, j) => j !== i))}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Mapa ---------------------------------- */

function ParkingMap({
  vehicles,
  settings,
  aptById,
  tenantByApt,
  onSelect,
}: {
  vehicles: ParkingVehicleDB[];
  settings: ParkingSettingsDB;
  aptById: Map<string, ApartmentDB>;
  tenantByApt: Map<string, string>;
  onSelect: (v: ParkingVehicleDB) => void;
}) {
  const bySpot = new Map<string, ParkingVehicleDB[]>();
  const noSpot: ParkingVehicleDB[] = [];
  vehicles.forEach(v => {
    const s = v.spot_number?.trim();
    if (!s) return void noSpot.push(v);
    bySpot.set(s, [...(bySpot.get(s) ?? []), v]);
  });

  // Vagas físicas: 1..N (N = maior entre as vagas configuradas e o maior nº em uso) + rótulos não numéricos em uso
  const numericUsed = [...bySpot.keys()].map(Number).filter(n => Number.isInteger(n) && n > 0);
  const total = Math.max(settings.car_spots, settings.moto_spots, ...numericUsed, 0);
  const labels = [
    ...Array.from({ length: total }, (_, i) => String(i + 1)),
    ...[...bySpot.keys()].filter(k => !/^\d+$/.test(k) || Number(k) < 1),
  ];

  const describe = (v: ParkingVehicleDB) => {
    const apt = v.apartment_id ? aptById.get(v.apartment_id) : undefined;
    const tenant = v.apartment_id ? tenantByApt.get(v.apartment_id) : undefined;
    return [apt && `Apto ${apt.unit_number}`, tenant, v.model, v.plate].filter(Boolean).join(' · ');
  };

  const Half = ({ v, kind }: { v: ParkingVehicleDB; kind: 'car' | 'moto' | 'other' }) => {
    const apt = v.apartment_id ? aptById.get(v.apartment_id) : undefined;
    const tone =
      kind === 'moto'
        ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300'
        : kind === 'car'
          ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
          : 'bg-purple-500/20 text-purple-700 dark:text-purple-300';
    return (
      <button
        type="button"
        title={describe(v)}
        onClick={() => onSelect(v)}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 hover:brightness-110 transition ${tone}`}
      >
        {kind === 'moto' ? <Bike className="w-4 h-4" /> : <Car className="w-4 h-4" />}
        <span className="text-[11px] font-semibold leading-none truncate max-w-full">{apt ? `Apto ${apt.unit_number}` : '—'}</span>
        <span className="text-[10px] font-mono leading-none truncate max-w-full opacity-80">{v.plate ?? ''}</span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500/40" /> Carro</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500/40" /> Moto</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-dashed border-border" /> Livre</span>
        <span>Vaga com carro e moto aparece dividida ao meio.</span>
      </div>

      {labels.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">Configure as vagas para montar o mapa.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
          {labels.map(label => {
            const list = bySpot.get(label) ?? [];
            const car = list.find(v => v.vehicle_type === 'car');
            const moto = list.find(v => v.vehicle_type === 'moto');
            const other = list.find(v => v.vehicle_type === 'other');
            const parts: [ParkingVehicleDB, 'car' | 'moto' | 'other'][] = [];
            if (car) parts.push([car, 'car']);
            if (moto) parts.push([moto, 'moto']);
            if (other) parts.push([other, 'other']);
            return (
              <div
                key={label}
                className={`rounded-lg overflow-hidden border min-h-[5.5rem] flex flex-col ${
                  parts.length ? 'border-border' : 'border-dashed border-border bg-muted/20'
                }`}
              >
                <div className="text-[11px] font-bold px-2 pt-1 text-muted-foreground">Vaga {label}</div>
                {parts.length ? (
                  <div className="flex flex-1 divide-x divide-background">
                    {parts.map(([v, k]) => <Half key={v.id} v={v} kind={k} />)}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Livre</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {noSpot.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sem vaga definida ({noSpot.length})</p>
          <div className="flex flex-wrap gap-2">
            {noSpot.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v)}
                className="text-xs rounded-md border border-border px-2 py-1 hover:bg-muted inline-flex items-center gap-1.5"
              >
                {v.vehicle_type === 'moto' ? <Bike className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
                {describe(v) || 'Veículo'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Aba ----------------------------------- */

export default function ParkingTab({
  condominiumId,
  apartments,
}: {
  condominiumId: string;
  apartments: ApartmentDB[];
}) {
  const { data: settings } = useParkingSettings(condominiumId);
  const { data: vehicles = [], isLoading } = useParkingVehicles(condominiumId);
  const { data: tenants = [] } = useTenants();
  const del = useDeleteParkingVehicle();

  const [view, setView] = useState<'table' | 'map'>('map');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | VehicleType>('all');
  const [editing, setEditing] = useState<ParkingVehicleDB | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toDelete, setToDelete] = useState<ParkingVehicleDB | null>(null);

  const aptById = useMemo(() => new Map(apartments.map(a => [a.id, a])), [apartments]);
  const tenantByApt = useMemo(() => {
    const m = new Map<string, string>();
    tenants.forEach(t => {
      if (!m.has(t.apartment_id)) m.set(t.apartment_id, `${t.first_name} ${t.last_name}`.trim());
    });
    return m;
  }, [tenants]);

  if (!settings) return null;

  const cars = vehicles.filter(v => v.vehicle_type === 'car').length;
  const motos = vehicles.filter(v => v.vehicle_type === 'moto').length;
  const aptsWithCar = new Set(vehicles.filter(v => v.vehicle_type === 'car' && v.apartment_id).map(v => v.apartment_id)).size;
  const aptsWithMoto = new Set(vehicles.filter(v => v.vehicle_type === 'moto' && v.apartment_id).map(v => v.apartment_id)).size;
  const totalApts = apartments.length;
  const pct = (n: number) => (totalApts ? Math.round((n / totalApts) * 100) : 0);
  const freeCars = settings.car_spots - cars;
  const freeMotos = settings.moto_spots - motos;

  const q = search.trim().toLowerCase();
  const filtered = vehicles
    .filter(v => typeFilter === 'all' || v.vehicle_type === typeFilter)
    .filter(v => {
      if (!q) return true;
      const apt = v.apartment_id ? aptById.get(v.apartment_id) : undefined;
      const tenant = v.apartment_id ? tenantByApt.get(v.apartment_id) : '';
      return [v.model, v.plate, v.color, v.spot_number, apt?.unit_number, tenant, v.notes]
        .some(x => x && x.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const ua = (a.apartment_id && aptById.get(a.apartment_id)?.unit_number) || '';
      const ub = (b.apartment_id && aptById.get(b.apartment_id)?.unit_number) || '';
      return ua.localeCompare(ub, undefined, { numeric: true });
    });

  const freeBadge = (free: number, total: number) =>
    total === 0 ? 'sem vagas cadastradas' : free < 0 ? `${-free} acima do limite` : `${free} livre${free === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Vagas de carro</p>
          <p className="text-2xl font-bold relative z-10">{cars}<span className="text-base text-muted-foreground">/{settings.car_spots}</span></p>
          <p className={`text-xs mt-1 relative z-10 ${freeCars < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{freeBadge(freeCars, settings.car_spots)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Vagas de moto</p>
          <p className="text-2xl font-bold relative z-10">{motos}<span className="text-base text-muted-foreground">/{settings.moto_spots}</span></p>
          <p className={`text-xs mt-1 relative z-10 ${freeMotos < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{freeBadge(freeMotos, settings.moto_spots)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Aptos com carro</p>
          <p className="text-2xl font-bold relative z-10">{pct(aptsWithCar)}%</p>
          <p className="text-xs mt-1 text-muted-foreground relative z-10">{aptsWithCar} de {totalApts}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Aptos com moto</p>
          <p className="text-2xl font-bold relative z-10">{pct(aptsWithMoto)}%</p>
          <p className="text-xs mt-1 text-muted-foreground relative z-10">{aptsWithMoto} de {totalApts}</p>
        </div>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5 shrink-0 self-start">
          <Button type="button" size="sm" variant={view === 'map' ? 'secondary' : 'ghost'} className="gap-1.5 h-8" onClick={() => setView('map')}>
            <LayoutGrid className="w-4 h-4" /> Mapa
          </Button>
          <Button type="button" size="sm" variant={view === 'table' ? 'secondary' : 'ghost'} className="gap-1.5 h-8" onClick={() => setView('table')}>
            <List className="w-4 h-4" /> Tabela
          </Button>
        </div>
        {view === 'table' ? (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input className="pl-9 pr-9" placeholder="Buscar por placa, modelo, apto ou inquilino..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="car">Carros</SelectItem>
                <SelectItem value="moto">Motos</SelectItem>
                <SelectItem value="other">Outros</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <div className="flex-1" />
        )}
        <Button variant="outline" className="gap-1.5" onClick={() => setShowSettings(true)}>
          <Settings2 className="w-4 h-4" /> Configurar
        </Button>
        <Button className="btn-primary-glow gap-1.5" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> Veículo
        </Button>
      </div>

      {settings.spot_length && settings.spot_width ? (
        <p className="text-xs text-muted-foreground">
          Tamanho da vaga: {fmtNum(settings.spot_length)} x {fmtNum(settings.spot_width)} m
        </p>
      ) : null}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary) / 0.3)', borderTopColor: 'hsl(var(--primary))' }} />
        </div>
      ) : view === 'map' ? (
        <ParkingMap
          vehicles={vehicles}
          settings={settings}
          aptById={aptById}
          tenantByApt={tenantByApt}
          onSelect={v => { setEditing(v); setShowForm(true); }}
        />
      ) : vehicles.length === 0 ? (
        <div className="empty-state">
          <ParkingSquare className="empty-state-icon" />
          <p className="font-medium text-muted-foreground mb-1">Nenhum veículo cadastrado</p>
          <p className="text-sm text-muted-foreground mb-4">Configure as vagas e adicione o primeiro veículo</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">Nenhum veículo encontrado.</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-3 font-semibold">Apto</th>
                <th className="p-3 font-semibold">Inquilino</th>
                <th className="p-3 font-semibold">Tipo</th>
                <th className="p-3 font-semibold">Modelo</th>
                <th className="p-3 font-semibold">Placa</th>
                <th className="p-3 font-semibold">Cor</th>
                <th className="p-3 font-semibold">Vaga</th>
                <th className="p-3 font-semibold">Dimensões</th>
                {settings.custom_fields.map(f => (
                  <th key={f.key} className="p-3 font-semibold">{f.label}</th>
                ))}
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const apt = v.apartment_id ? aptById.get(v.apartment_id) : undefined;
                return (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-medium whitespace-nowrap">{apt ? `Apto ${apt.unit_number}` : '—'}</td>
                    <td className="p-3">{(v.apartment_id && tenantByApt.get(v.apartment_id)) || '—'}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {v.vehicle_type === 'moto' ? <Bike className="w-4 h-4 text-muted-foreground" /> : <Car className="w-4 h-4 text-muted-foreground" />}
                        {TYPE_LABEL[v.vehicle_type]}
                      </span>
                    </td>
                    <td className="p-3">{v.model ?? '—'}</td>
                    <td className="p-3 whitespace-nowrap font-mono text-xs">{v.plate ?? '—'}</td>
                    <td className="p-3">{v.color ?? '—'}</td>
                    <td className="p-3">{v.spot_number ?? '—'}</td>
                    <td className="p-3 whitespace-nowrap">
                      {v.length_m != null && v.width_m != null ? `${fmtNum(v.length_m)} x ${fmtNum(v.width_m)} m` : '—'}
                    </td>
                    {settings.custom_fields.map(f => (
                      <td key={f.key} className="p-3">{fmtExtra(f, v.extra[f.key])}</td>
                    ))}
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditing(v); setShowForm(true); }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setToDelete(v)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <VehicleModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => setShowForm(false)}
          condominiumId={condominiumId}
          apartments={apartments}
          settings={settings}
          initial={editing ?? undefined}
        />
      )}
      {showSettings && <SettingsModal open onClose={() => setShowSettings(false)} settings={settings} />}

      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover veículo</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.model ?? 'Este veículo'} {toDelete?.plate ? `(${toDelete.plate})` : ''} será removido do estacionamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await del.mutateAsync({ id: toDelete.id, condominium_id: condominiumId });
                setToDelete(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
