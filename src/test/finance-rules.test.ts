import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPeriodAndDueDate, getRecordStatus, computeRecordStatus, clipPeriodToEndDate,
} from '@/lib/utils-app';
import { calcOwed, calcReceived, FinancialRecordDB } from '@/hooks/useFinancial';

describe('getPeriodAndDueDate', () => {
  it('dia de pagamento antes do fim do período: vence no mês seguinte ao fim', () => {
    const r = getPeriodAndDueDate('2026-06', '2025-06-25', 5);
    expect(r.periodLabel).toBe('25/06/2026 a 25/07/2026');
    expect(r.dueDateStr).toBe('2026-08-05');
  });

  it('dia de pagamento depois do fim do período: vence no mês do fim', () => {
    const r = getPeriodAndDueDate('2026-06', '2025-06-05', 10);
    expect(r.dueDateStr).toBe('2026-07-10');
    expect(r.dueDateLabel).toBe('10/07/2026');
  });

  it('vira o ano em dezembro', () => {
    const r = getPeriodAndDueDate('2026-12', '2026-12-01', 1);
    expect(r.periodLabel).toBe('01/12/2026 a 01/01/2027');
    expect(r.dueDateStr).toBe('2027-01-01');
  });

  it('limita o dia ao último dia de fevereiro', () => {
    expect(getPeriodAndDueDate('2026-01', '2025-01-31', 31).dueDateStr).toBe('2026-02-28');
  });

  it('aplica o novo dia de vencimento só a partir do mês agendado', () => {
    expect(getPeriodAndDueDate('2026-07', '2025-06-05', 10, 20, '2026-08-01').dueDateStr).toBe('2026-08-10');
    expect(getPeriodAndDueDate('2026-08', '2025-06-05', 10, 20, '2026-08-01').dueDateStr).toBe('2026-09-20');
  });
});

describe('clipPeriodToEndDate', () => {
  const p = '01/06/2026 a 01/07/2026';
  it('encurta o fim quando a saída cai dentro do período', () => {
    expect(clipPeriodToEndDate(p, '2026-06-15')).toBe('01/06/2026 a 15/06/2026');
  });
  it('não mexe quando a saída está fora do período ou ausente', () => {
    expect(clipPeriodToEndDate(p, '2026-05-30')).toBe(p);
    expect(clipPeriodToEndDate(p, '2026-07-01')).toBe(p);
    expect(clipPeriodToEndDate(p, null)).toBe(p);
  });
});

describe('status do registro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 15, 0, 0)); // 07/10/2026
  });
  afterEach(() => vi.useRealTimers());

  it('vencido quando a data de vencimento já passou', () => {
    expect(getRecordStatus('2026-06', 5, '2025-06-25')).toBe('overdue'); // vence 05/08/2026
  });
  it('a vencer quando o vencimento é no futuro', () => {
    expect(getRecordStatus('2026-09', 5, '2025-06-25')).toBe('pending'); // vence 05/11/2026
  });
  it('vencendo hoje ainda não é atraso', () => {
    expect(getRecordStatus('2026-09', 7, '2026-09-01')).toBe('pending'); // vence 07/10/2026
  });
  it('pago prevalece sobre qualquer data', () => {
    expect(computeRecordStatus(true, '2020-01', 1, '2020-01-01')).toBe('paid');
  });
});

describe('saldo devedor e valor recebido', () => {
  const base = {
    paid: true, rent_value: 600, paid_amount: null, debt_paid_amount: null, debt_payment_method: null,
  } as unknown as FinancialRecordDB;
  const rec = (o: Partial<FinancialRecordDB>) => ({ ...base, ...o }) as FinancialRecordDB;

  it('não pago: nada devido nem recebido (é "a receber", não saldo)', () => {
    expect(calcOwed(rec({ paid: false }))).toBe(0);
    expect(calcReceived(rec({ paid: false }))).toBe(0);
  });
  it('pago integral', () => {
    expect(calcOwed(base)).toBe(0);
    expect(calcReceived(base)).toBe(600);
  });
  it('pagamento parcial gera saldo devedor', () => {
    expect(calcOwed(rec({ paid_amount: 400 }))).toBe(200);
    expect(calcReceived(rec({ paid_amount: 400 }))).toBe(400);
  });
  it('pagamento posterior abate o saldo', () => {
    expect(calcOwed(rec({ paid_amount: 400, debt_paid_amount: 100 }))).toBe(100);
    expect(calcReceived(rec({ paid_amount: 400, debt_paid_amount: 100 }))).toBe(500);
  });
  it('acordo quita sem dívida e conta só o valor pago', () => {
    const r = rec({ paid_amount: 400, debt_payment_method: 'acordo' });
    expect(calcOwed(r)).toBe(0);
    expect(calcReceived(r)).toBe(400);
  });
  it('pagou a mais: saldo nunca fica negativo', () => {
    expect(calcOwed(rec({ paid_amount: 700 }))).toBe(0);
  });
});
