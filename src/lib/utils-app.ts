import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try { return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR }); } catch { return dateStr; }
}
export function formatDateLong(dateStr: string): string {
  if (!dateStr) return '-';
  try { return format(parseISO(dateStr), "d 'de' MMMM 'de' yyyy", { locale: ptBR }); } catch { return dateStr; }
}
export function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const YEARS = Array.from({ length: 20 }, (_, i) => 2026 + i);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getPeriodAndDueDate(
  monthStr: string,
  contractStartDate: string | null,
  paymentDay: number,
  desiredPaymentDay?: number | null,
  desiredPaymentDate?: string | null
) {
  // Se há uma mudança de dia de vencimento agendada e o mês atual já atingiu
  // o mês de aplicação, usa o novo dia de vencimento
  // desiredPaymentDate é armazenado como YYYY-MM-01 (tipo date do Postgres)
  // monthStr é YYYY-MM — comparamos só os 7 primeiros chars
  if (desiredPaymentDay && desiredPaymentDate && monthStr >= desiredPaymentDate.substring(0, 7)) {
    paymentDay = desiredPaymentDay;
  }

  const [y, m] = monthStr.split('-').map(Number);

  let startDay = 1;
  if (contractStartDate) {
    const parsed = new Date(contractStartDate + 'T12:00:00');
    startDay = parsed.getDate();
  }

  const periodStartDay = Math.min(startDay, daysInMonth(y, m));
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const periodEndDay = Math.min(startDay, daysInMonth(nextY, nextM));

  const periodLabel =
    `${String(periodStartDay).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` +
    ` a ` +
    `${String(periodEndDay).padStart(2, '0')}/${String(nextM).padStart(2, '0')}/${nextY}`;

  let dueDateStr: string;
  let dueDateLabel: string;

  if (paymentDay >= periodEndDay) {
    const dueDay = Math.min(paymentDay, daysInMonth(nextY, nextM));
    dueDateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    dueDateLabel = `${String(dueDay).padStart(2, '0')}/${String(nextM).padStart(2, '0')}/${nextY}`;
  } else {
    const dueM = nextM === 12 ? 1 : nextM + 1;
    const dueY = nextM === 12 ? nextY + 1 : nextY;
    const dueDay = Math.min(paymentDay, daysInMonth(dueY, dueM));
    dueDateStr = `${dueY}-${String(dueM).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    dueDateLabel = `${String(dueDay).padStart(2, '0')}/${String(dueM).padStart(2, '0')}/${dueY}`;
  }

  return { periodLabel, dueDateStr, dueDateLabel };
}

/**
 * Agora recebe contractStartDate para calcular o vencimento corretamente.
 * Antes usava Math.min(1, ...) como periodEndDay, o que sempre dava 1 — ERRADO.
 */
export function getRecordStatus(
  month: string,
  paymentDay: number | null | undefined,
  contractStartDate?: string | null,
  desiredPaymentDay?: number | null,
  desiredPaymentDate?: string | null
): 'overdue' | 'pending' {
  const day = paymentDay ?? 1;
  const { dueDateStr } = getPeriodAndDueDate(month, contractStartDate ?? null, day, desiredPaymentDay, desiredPaymentDate);
  const [dy, dm, dd] = dueDateStr.split('-').map(Number);
  const dueDate = new Date(dy, dm - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > dueDate ? 'overdue' : 'pending';
}
