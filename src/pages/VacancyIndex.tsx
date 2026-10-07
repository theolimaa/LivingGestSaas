import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, DoorOpen, Home, Loader2, TrendingDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Layout from '@/components/Layout';
import { formatCurrency, MONTHS, YEARS } from '@/lib/utils-app';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useContracts } from '@/hooks/useContracts';
import { useTenants, useAllPreviousTenants } from '@/hooks/useTenants';
import { computeVacancy, fmtDate, type VacancyEntry } from '@/lib/vacancy';

// Tudo é calculado a partir dos contratos (ver lib/vacancy.ts), então atualiza sozinho quando um contrato muda.

const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

export default function VacancyIndex() {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const t = setInterval(() => setToday(todayKey()), 60_000);
    return () => clearInterval(t);
  }, []);
  const currentYear = Number(today.slice(0, 4));
  const currentMonthIdx = Number(today.slice(5, 7)) - 1;

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedCondo, setSelectedCondo] = useState('all');
  const [open, setOpen] = useState<Set<number>>(new Set());

  const { data: condominiums = [], isLoading: l1 } = useCondominiums();
  const { data: apartments = [], isLoading: l2 } = useApartments();
  const { data: contracts = [], isLoading: l3 } = useContracts();
  const { data: tenants = [], isLoading: l4 } = useTenants();
  const { data: previousTenants = [], isLoading: l5 } = useAllPreviousTenants();
  const isLoading = l1 || l2 || l3 || l4 || l5;

  const year = Number(selectedYear);

  const { entries, vacantNow, totalApts } = useMemo(() => {
    const tenantInfo = new Map<string, { apartmentId: string; name: string }>();
    for (const t of tenants) tenantInfo.set(t.id, { apartmentId: t.apartment_id, name: `${t.first_name} ${t.last_name}`.trim() });
    for (const p of previousTenants) {
      if (p.original_id && p.apartment_id && !tenantInfo.has(p.original_id)) {
        tenantInfo.set(p.original_id, { apartmentId: p.apartment_id, name: `${p.first_name} ${p.last_name}`.trim() });
      }
    }
    return computeVacancy({ year, today, apartments, condominiums, contracts, tenantInfo, condoFilter: selectedCondo });
  }, [today, year, selectedCondo, tenants, previousTenants, contracts, apartments, condominiums]);

  const monthlyData = MONTHS.map((label, m) => {
    const list = entries.filter(e => e.month === m).sort((a, b) => a.condo.localeCompare(b.condo) || a.unit.localeCompare(b.unit, undefined, { numeric: true }) || a.from - b.from);
    return {
      label, m, list,
      aptCount: new Set(list.map(e => e.aptId)).size,
      days: list.reduce((s, e) => s + e.days, 0),
      loss: list.reduce((s, e) => s + e.loss, 0),
    };
  });
  const visibleMonths = monthlyData.filter(md => year < currentYear || (year === currentYear && md.m <= currentMonthIdx));
  const totalLoss = entries.reduce((s, e) => s + e.loss, 0);
  const isCurrentYear = year === currentYear;
  const currentMonthLoss = isCurrentYear ? monthlyData[currentMonthIdx].loss : null;
  const occupancyNow = totalApts > 0 ? ((totalApts - vacantNow) / totalApts) * 100 : 0;
  const ongoingEntries = entries.filter(e => e.ongoing);

  const byApartment = useMemo(() => {
    const map = new Map<string, { condo: string; unit: string; days: number; loss: number; periods: Map<string, VacancyEntry[]> }>();
    for (const e of entries) {
      const cur = map.get(e.aptId) ?? { condo: e.condo, unit: e.unit, days: 0, loss: 0, periods: new Map() };
      cur.days += e.days;
      cur.loss += e.loss;
      cur.periods.set(e.gapKey, [...(cur.periods.get(e.gapKey) ?? []), e]);
      map.set(e.aptId, cur);
    }
    return [...map.values()].sort((a, b) => b.loss - a.loss);
  }, [entries]);

  function toggle(m: number) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 w-full max-w-[1360px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-primary" />
            Índice de Vacância
          </h1>
          <p className="text-muted-foreground text-sm">
            Quanto se deixou de receber com apartamentos sem contrato vigente. Atualiza sozinho a partir dos contratos.
          </p>
        </div>

        <div className="flex gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.filter(y => y <= currentYear).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedCondo} onValueChange={setSelectedCondo}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Todos os condomínios" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os condomínios</SelectItem>
              {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Deixado de receber ({selectedYear})</p>
                <p className="text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(totalLoss)}</p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">{entries.reduce((s, e) => s + e.days, 0)} dias vagos no total</p>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Perda em {MONTHS[currentMonthIdx]}</p>
                <p className="text-2xl font-bold relative z-10">{currentMonthLoss === null ? '—' : formatCurrency(currentMonthLoss)}</p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">mês atual</p>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Vagos hoje</p>
                <p className="text-2xl font-bold relative z-10" style={{ color: vacantNow > 0 ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }}>
                  {isCurrentYear ? vacantNow : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">de {totalApts} aptos</p>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Ocupação hoje</p>
                <p className="text-2xl font-bold text-primary relative z-10">{isCurrentYear ? `${occupancyNow.toFixed(1)}%` : '—'}</p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">{totalApts - vacantNow}/{totalApts} aptos</p>
              </div>
            </div>

            {isCurrentYear && ongoingEntries.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-x-auto">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="font-semibold flex items-center gap-2"><TrendingDown className="w-4 h-4 text-destructive" /> Vagos agora</h2>
                </div>
                <div className="divide-y divide-border">
                  {ongoingEntries.map(e => (
                    <div key={e.key} className="px-5 py-3 flex items-center gap-4 text-sm">
                      <Home className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{e.condo} · Apto {e.unit}</p>
                        <p className="text-xs text-muted-foreground">{e.reason}</p>
                      </div>
                      <p className="text-xs text-muted-foreground text-right">perde ~{formatCurrency(e.rent)}/mês</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-semibold">Perda por mês — {selectedYear}</h2>
                <p className="text-xs text-muted-foreground">Clique no mês para ver a justificativa de cada valor.</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2">Mês</th>
                    <th className="text-center px-4 py-2">Aptos com vacância</th>
                    <th className="text-center px-4 py-2">Dias vagos</th>
                    <th className="text-right px-4 py-2">Deixado de receber</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMonths.map(md => {
                    const isOpen = open.has(md.m);
                    const clickable = md.list.length > 0;
                    return (
                      <Fragment key={md.m}>
                        <tr
                          className={`border-b border-border/50 ${clickable ? 'cursor-pointer hover:bg-muted/30' : ''} ${isCurrentYear && md.m === currentMonthIdx ? 'bg-primary/5' : ''}`}
                          onClick={() => clickable && toggle(md.m)}
                        >
                          <td className="px-4 py-2.5 font-medium">
                            <span className="inline-flex items-center gap-1">
                              {clickable ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
                              {md.label}
                              {isCurrentYear && md.m === currentMonthIdx && <span className="ml-1 text-xs text-primary">(atual)</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">{md.aptCount}</td>
                          <td className="px-4 py-2.5 text-center">{md.days}</td>
                          <td className="px-4 py-2.5 text-right font-semibold" style={{ color: md.loss > 0 ? 'hsl(var(--overdue))' : undefined }}>
                            {md.loss > 0 ? formatCurrency(md.loss) : '—'}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-border/50 bg-muted/20">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 pr-3">Apartamento</th>
                                      <th className="text-left py-1 pr-3">Período vago</th>
                                      <th className="text-center py-1 pr-3">Dias</th>
                                      <th className="text-left py-1 pr-3">Cálculo</th>
                                      <th className="text-left py-1 pr-3">Motivo</th>
                                      <th className="text-right py-1">Perda</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {md.list.map(e => (
                                      <tr key={e.key} className="border-t border-border/40 align-top">
                                        <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{e.condo} · {e.unit}</td>
                                        <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(e.from)} a {fmtDate(e.to)}{e.ongoing ? ' (em andamento)' : ''}</td>
                                        <td className="py-1.5 pr-3 text-center">{e.days}</td>
                                        <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{e.days}/{e.dim} × {formatCurrency(e.rent)}</td>
                                        <td className="py-1.5 pr-3 text-muted-foreground">{e.reason}</td>
                                        <td className="py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(e.loss)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-4 py-2.5">Total {selectedYear}</td>
                    <td />
                    <td className="px-4 py-2.5 text-center">{entries.reduce((s, e) => s + e.days, 0)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(totalLoss)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-semibold">Por apartamento — {selectedYear}</h2>
              </div>
              {byApartment.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">Nenhuma vacância no período.</p>
              ) : (
                <div className="divide-y divide-border">
                  {byApartment.map(a => (
                    <div key={`${a.condo}-${a.unit}`} className="px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold">{a.condo} · Apto {a.unit}</p>
                        <p className="font-semibold" style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(a.loss)} <span className="text-xs text-muted-foreground font-normal">({a.days} dias)</span></p>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {[...a.periods.values()].map(list => (
                          <li key={list[0].key}>
                            {fmtDate(list[0].from)} a {fmtDate(list[list.length - 1].to)} — {list.reduce((s, e) => s + e.days, 0)} dias · {list[0].reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
