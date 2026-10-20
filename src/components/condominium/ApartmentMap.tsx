import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { formatCurrency } from '@/lib/utils-app';

export interface ApartmentMapItem {
  id: string;
  unitNumber: string;
  tenantName: string | null;
  overdue: boolean;
  received: number;
}

type Status = 'ok' | 'overdue' | 'vacant';
type Filter = 'all' | Status;

function statusOf(i: ApartmentMapItem): Status {
  if (!i.tenantName) return 'vacant';
  return i.overdue ? 'overdue' : 'ok';
}

// "950-3" -> grupo "950"; "101" -> "Andar 1"; demais -> sem grupo
function groupOf(unit: string): { key: string; label: string } {
  const dash = unit.lastIndexOf('-');
  if (dash > 0) return { key: unit.slice(0, dash), label: `Nº ${unit.slice(0, dash)}` };
  if (/^\d{3,}$/.test(unit)) return { key: unit.slice(0, -2), label: `Andar ${unit.slice(0, -2)}` };
  return { key: '', label: '' };
}

const TILE: Record<Status, string> = {
  ok: 'bg-green-500/10 border-green-500/40 hover:bg-green-500/20',
  overdue: 'bg-destructive/10 border-destructive/50 hover:bg-destructive/20',
  vacant: 'bg-muted/40 border-dashed border-border hover:bg-muted',
};
const DOT: Record<Status, string> = {
  ok: 'bg-green-500',
  overdue: 'bg-destructive',
  vacant: 'bg-muted-foreground/40',
};

export default function ApartmentMap({ items }: { items: ApartmentMapItem[] }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const c = { all: items.length, ok: 0, overdue: 0, vacant: 0 };
    items.forEach(i => { c[statusOf(i)]++; });
    return c;
  }, [items]);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: ApartmentMapItem[] }>();
    items.forEach(i => {
      const g = groupOf(i.unitNumber);
      if (!m.has(g.key)) m.set(g.key, { label: g.label, items: [] });
      m.get(g.key)!.items.push(i);
    });
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, g]) => ({
        ...g,
        items: g.items.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
      }));
  }, [items]);

  const filters: { value: Filter; label: string; dot?: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'ok', label: 'Em dia', dot: DOT.ok },
    { value: 'overdue', label: 'Inadimplentes', dot: DOT.overdue },
    { value: 'vacant', label: 'Vagos', dot: DOT.vacant },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(filter === f.value ? 'all' : f.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
            {f.label} <span className="opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.label || 'all'} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
            {g.label && (
              <div className="sm:w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:pt-3">
                {g.label}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 flex-1">
              {g.items.map(i => {
                const s = statusOf(i);
                const dim = filter !== 'all' && filter !== s;
                const title = [
                  `Apto ${i.unitNumber}`,
                  i.tenantName ?? 'Vago',
                  s === 'overdue' ? 'Inadimplente' : s === 'ok' ? 'Em dia' : '',
                  i.received > 0 ? `Recebido: ${formatCurrency(i.received)}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={i.id}
                    type="button"
                    title={title}
                    onClick={() => navigate(`/apartments/${i.id}`)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${TILE[s]} ${dim ? 'opacity-25' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-sm">{i.unitNumber}</span>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[s]}`} />
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground min-h-[1rem]">
                      {i.tenantName ? (
                        <>
                          <User className="w-3 h-3 shrink-0" />
                          <span className="truncate">{i.tenantName.split(' ')[0]}</span>
                        </>
                      ) : (
                        <span>Vago</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
