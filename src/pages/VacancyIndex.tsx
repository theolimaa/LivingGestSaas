import { useState } from 'react';
import { DoorOpen, Loader2, TrendingDown, TrendingUp, Home } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Layout from '@/components/Layout';
import { formatCurrency, MONTHS, YEARS } from '@/lib/utils-app';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useFinancialRecordsByYear } from '@/hooks/useFinancial';

export default function VacancyIndex() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedCondo, setSelectedCondo] = useState('all');

  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: financialRecords = [], isLoading } = useFinancialRecordsByYear(Number(selectedYear));

  const filteredCondos = selectedCondo === 'all' ? condominiums : condominiums.filter(c => c.id === selectedCondo);

  // Para cada mês do ano, calcula ocupação
  const monthlyData = MONTHS.map((monthLabel, idx) => {
    const monthKey = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
    const condosToCheck = filteredCondos;
    const aptsToCheck = apartments.filter(a =>
      condosToCheck.some(c => c.id === a.condominium_id)
    );
    const totalApts = aptsToCheck.length;
    const occupiedApts = aptsToCheck.filter(apt =>
      financialRecords.some(r => r.apartment_id === apt.id && r.month === monthKey)
    ).length;
    const vacantApts = totalApts - occupiedApts;
    const occupancyRate = totalApts > 0 ? (occupiedApts / totalApts) * 100 : 0;
    const vacancyRate = totalApts > 0 ? (vacantApts / totalApts) * 100 : 0;
    const potentialRevenue = financialRecords
      .filter(r => aptsToCheck.some(a => a.id === r.apartment_id) && r.month === monthKey)
      .reduce((s, r) => s + r.rent_value, 0);

    return { monthLabel, monthKey, totalApts, occupiedApts, vacantApts, occupancyRate, vacancyRate, potentialRevenue };
  });

  // Por condomínio no mês atual
  const currentMonthIdx = new Date().getMonth();
  const currentMonthKey = `${selectedYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;

  const condoBreakdown = filteredCondos.map(condo => {
    const condoApts = apartments.filter(a => a.condominium_id === condo.id);
    const total = condoApts.length;
    const occupied = condoApts.filter(apt =>
      financialRecords.some(r => r.apartment_id === apt.id && r.month === currentMonthKey)
    ).length;
    const vacant = total - occupied;
    const vacancyRate = total > 0 ? (vacant / total) * 100 : 0;
    return { condo, total, occupied, vacant, vacancyRate };
  });

  // Média anual
  const validMonths = monthlyData.filter(m => m.totalApts > 0);
  const avgVacancy = validMonths.length > 0
    ? validMonths.reduce((s, m) => s + m.vacancyRate, 0) / validMonths.length
    : 0;
  const avgOccupancy = 100 - avgVacancy;
  const currentMonth = monthlyData[currentMonthIdx];

  // Barra de progresso
  function Bar({ value, color }: { value: number; color: string }) {
    return (
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-primary" />
            Índice de Vacância
          </h1>
          <p className="text-muted-foreground text-sm">Acompanhe a ocupação dos apartamentos ao longo do tempo</p>
        </div>

        {/* Filtros */}
        <div className="flex gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
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
            {/* Cards resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Taxa de Ocupação (mês atual)</p>
                <p className="text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--paid))' }}>
                  {currentMonth?.occupancyRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">
                  {currentMonth?.occupiedApts}/{currentMonth?.totalApts} aptos
                </p>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Taxa de Vacância (mês atual)</p>
                <p className="text-2xl font-bold relative z-10" style={{ color: currentMonth?.vacancyRate > 20 ? 'hsl(var(--overdue))' : 'hsl(var(--warning))' }}>
                  {currentMonth?.vacancyRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">
                  {currentMonth?.vacantApts} vago{currentMonth?.vacantApts !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Média de Ocupação ({selectedYear})</p>
                <p className="text-2xl font-bold text-primary relative z-10">{avgOccupancy.toFixed(1)}%</p>
                <div className="mt-2 relative z-10"><Bar value={avgOccupancy} color="hsl(var(--primary))" /></div>
              </div>
              <div className="stat-card">
                <p className="text-xs font-semibold text-foreground mb-1 relative z-10">Receita Potencial (mês atual)</p>
                <p className="text-2xl font-bold relative z-10">{formatCurrency(currentMonth?.potentialRevenue ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1 relative z-10">contratos ativos</p>
              </div>
            </div>

            {/* Histórico mensal */}
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-semibold">Histórico Mensal — {selectedYear}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2">Mês</th>
                      <th className="text-center px-4 py-2">Total</th>
                      <th className="text-center px-4 py-2">Ocupados</th>
                      <th className="text-center px-4 py-2">Vagos</th>
                      <th className="text-left px-4 py-2 w-48">Ocupação</th>
                      <th className="text-right px-4 py-2">Receita Potencial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m, idx) => {
                      const isCurrentMonth = idx === currentMonthIdx && String(currentYear) === selectedYear;
                      return (
                        <tr
                          key={m.monthKey}
                          className={`border-b border-border/50 last:border-0 ${isCurrentMonth ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-4 py-2.5 font-medium">
                            {m.monthLabel}
                            {isCurrentMonth && <span className="ml-2 text-xs text-primary">(atual)</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">{m.totalApts}</td>
                          <td className="px-4 py-2.5 text-center" style={{ color: 'hsl(var(--paid))' }}>
                            {m.occupiedApts}
                          </td>
                          <td className="px-4 py-2.5 text-center" style={{ color: m.vacantApts > 0 ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }}>
                            {m.vacantApts}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Bar value={m.occupancyRate} color={m.occupancyRate >= 80 ? '#22c55e' : m.occupancyRate >= 60 ? '#eab308' : '#ef4444'} />
                              <span className="text-xs text-muted-foreground w-10 text-right">
                                {m.occupancyRate.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">
                            {m.potentialRevenue > 0 ? formatCurrency(m.potentialRevenue) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Por condomínio */}
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="font-semibold">Por Condomínio — {MONTHS[currentMonthIdx]}</h2>
              </div>
              <div className="divide-y divide-border">
                {condoBreakdown.map(({ condo, total, occupied, vacant, vacancyRate }) => (
                  <div key={condo.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                      <Home className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{condo.name}</p>
                      <p className="text-xs text-muted-foreground">{occupied} ocupados · {vacant} vago{vacant !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-40">
                      <Bar
                        value={(occupied / total) * 100}
                        color={vacancyRate === 0 ? '#22c55e' : vacancyRate < 20 ? '#eab308' : '#ef4444'}
                      />
                    </div>
                    <div className="w-16 text-right">
                      <span className={`text-sm font-bold ${vacancyRate === 0 ? 'text-green-500' : vacancyRate < 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {vacancyRate.toFixed(0)}% vac.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
