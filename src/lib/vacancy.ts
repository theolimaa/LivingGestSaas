// Cálculo de vacância a partir dos contratos.
// Vacância = dia sem contrato vigente (início → "Contrato até") no apartamento.
// Perda do mês = dias vagos ÷ dias do mês × aluguel de referência do apartamento
// (aluguel do último contrato; sem contrato, média do condomínio).

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → número de dias desde 1970 (UTC, sem efeito de fuso/horário de verão). */
export const toIdx = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};

export const fmtDate = (i: number) => {
  const d = new Date(i * DAY);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

export const daysInMonth = (year: number, m0: number) => new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();

export interface VacancyEntry {
  key: string;
  gapKey: string;
  aptId: string;
  condo: string;
  unit: string;
  month: number; // 0-11
  from: number;
  to: number;
  days: number;
  dim: number;
  rent: number;
  loss: number;
  ongoing: boolean;
  reason: string;
}

export interface VacancyInput {
  year: number;
  today: string; // 'YYYY-MM-DD'
  apartments: { id: string; condominium_id: string; unit_number: string }[];
  condominiums: { id: string; name: string }[];
  contracts: { tenant_id: string; start_date: string; end_date: string | null; rent_value: number }[];
  /** tenant_id → apartamento e nome (inquilinos ativos e anteriores). */
  tenantInfo: Map<string, { apartmentId: string; name: string }>;
  condoFilter?: string; // id do condomínio ou 'all'
}

/** O apartamento ficou sem nenhum contrato vigente durante o mês inteiro? (m0 = 0-11) */
export function isVacantAllMonth(
  aptId: string,
  year: number,
  m0: number,
  contracts: VacancyInput['contracts'],
  tenantInfo: VacancyInput['tenantInfo'],
): boolean {
  const mStart = toIdx(`${year}-${pad(m0 + 1)}-01`);
  const mEnd = mStart + daysInMonth(year, m0) - 1;
  return !contracts.some(c => {
    if (!c.start_date || tenantInfo.get(c.tenant_id)?.apartmentId !== aptId) return false;
    const start = toIdx(c.start_date);
    const end = c.end_date ? toIdx(c.end_date) : Infinity;
    return start <= mEnd && end >= mStart;
  });
}

export function gapReason(prev: string | null, prevEnd: number | null, next: string | null, nextStart: number | null) {
  const left = prev ? `${prev} saiu${prevEnd !== null ? ` (contrato até ${fmtDate(prevEnd)})` : ''}` : 'sem contrato anterior';
  const right = next && nextStart !== null ? `${next} entra em ${fmtDate(nextStart)}` : 'sem novo contrato';
  return `${left}; ${right}`;
}

export function computeVacancy(input: VacancyInput): { entries: VacancyEntry[]; vacantNow: number; totalApts: number } {
  const { year, today, apartments, condominiums, contracts, tenantInfo, condoFilter = 'all' } = input;
  const todayIdx = toIdx(today);
  const yearStart = toIdx(`${year}-01-01`);
  const yearEnd = Math.min(toIdx(`${year}-12-31`), todayIdx);

  type Interval = { start: number; end: number; rent: number; name: string };
  const byApt = new Map<string, Interval[]>();
  for (const c of contracts) {
    const info = tenantInfo.get(c.tenant_id);
    if (!info || !c.start_date) continue;
    const list = byApt.get(info.apartmentId) ?? [];
    list.push({ start: toIdx(c.start_date), end: c.end_date ? toIdx(c.end_date) : Infinity, rent: Number(c.rent_value), name: info.name });
    byApt.set(info.apartmentId, list);
  }

  const condoAvg = new Map<string, number>();
  for (const condo of condominiums) {
    const rents = apartments.filter(a => a.condominium_id === condo.id).flatMap(a => (byApt.get(a.id) ?? []).map(i => i.rent));
    condoAvg.set(condo.id, rents.length ? rents.reduce((s, r) => s + r, 0) / rents.length : 0);
  }

  const condoById = new Map(condominiums.map(c => [c.id, c.name]));
  const aptsInScope = apartments.filter(a => condoFilter === 'all' || a.condominium_id === condoFilter);
  const result: VacancyEntry[] = [];

  if (yearEnd >= yearStart) {
    for (const apt of aptsInScope) {
      const intervals = [...(byApt.get(apt.id) ?? [])].sort((a, b) => a.start - b.start);
      const rent = intervals.length ? intervals[intervals.length - 1].rent : condoAvg.get(apt.condominium_id) ?? 0;
      const condo = condoById.get(apt.condominium_id) ?? '—';

      const addGap = (gapFrom: number, gapTo: number, prev: string | null, prevEnd: number | null, next: string | null, nextStart: number | null) => {
        if (gapFrom > gapTo) return;
        const ongoing = gapTo === yearEnd && yearEnd === todayIdx && (nextStart === null || nextStart > todayIdx);
        const reason = gapReason(prev, prevEnd, next, nextStart);
        const firstMonth = new Date(gapFrom * DAY).getUTCMonth();
        const lastMonth = new Date(gapTo * DAY).getUTCMonth();
        for (let m = firstMonth; m <= lastMonth; m++) {
          const dim = daysInMonth(year, m);
          const mStart = toIdx(`${year}-${pad(m + 1)}-01`);
          const from = Math.max(gapFrom, mStart);
          const to = Math.min(gapTo, mStart + dim - 1);
          const days = to - from + 1;
          result.push({
            key: `${apt.id}-${gapFrom}-${m}`, gapKey: `${apt.id}-${gapFrom}`, aptId: apt.id, condo, unit: apt.unit_number, month: m,
            from, to, days, dim, rent, loss: (days / dim) * rent, ongoing: ongoing && m === lastMonth, reason,
          });
        }
      };

      let cursor = yearStart;
      let maxEnd = -Infinity;
      let lastName: string | null = null;
      let lastEnd: number | null = null;
      let closed = false;
      for (const iv of intervals) {
        if (iv.start > cursor) {
          addGap(cursor, Math.min(iv.start - 1, yearEnd), lastName, lastEnd, iv.name, iv.start);
        }
        if (iv.end >= maxEnd) {
          maxEnd = iv.end;
          lastName = iv.name;
          lastEnd = Number.isFinite(iv.end) ? iv.end : null;
        }
        cursor = Math.max(cursor, iv.end + 1);
        if (cursor > yearEnd) { closed = true; break; }
      }
      if (!closed) addGap(cursor, yearEnd, lastName, lastEnd, null, null);
    }
  }

  const vacantNow = new Set(result.filter(e => e.ongoing).map(e => e.aptId)).size;
  return { entries: result, vacantNow, totalApts: aptsInScope.length };
}
