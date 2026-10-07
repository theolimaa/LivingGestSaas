import { describe, it, expect } from 'vitest';
import { computeVacancy, VacancyInput } from '@/lib/vacancy';

const condominiums = [{ id: 'c1', name: 'Roseno Lopes' }];
const apartments = [
  { id: 'a1', condominium_id: 'c1', unit_number: '950-4' },
  { id: 'a2', condominium_id: 'c1', unit_number: '10-1' },
];

function input(over: Partial<VacancyInput>): VacancyInput {
  return {
    year: 2026,
    today: '2026-10-07',
    apartments,
    condominiums,
    contracts: [],
    tenantInfo: new Map(),
    ...over,
  };
}

describe('computeVacancy', () => {
  it('troca de inquilino com intervalo: 950-4 ficou vago de 12/06 a 19/07', () => {
    const tenantInfo = new Map([
      ['t1', { apartmentId: 'a1', name: 'Maria' }],
      ['t2', { apartmentId: 'a1', name: 'Isabele' }],
    ]);
    const { entries } = computeVacancy(input({
      apartments: [apartments[0]],
      tenantInfo,
      contracts: [
        { tenant_id: 't1', start_date: '2025-06-25', end_date: '2026-06-11', rent_value: 600 },
        { tenant_id: 't2', start_date: '2026-07-20', end_date: null, rent_value: 600 },
      ],
    }));
    expect(entries.map(e => [e.month, e.days])).toEqual([[5, 19], [6, 19]]);
    expect(entries[0].loss).toBeCloseTo(380, 2);   // 19/30 × 600
    expect(entries[1].loss).toBeCloseTo(367.74, 2); // 19/31 × 600
    expect(entries[0].reason).toContain('Maria saiu');
    expect(entries[0].reason).toContain('Isabele entra em 20/07/2026');
  });

  it('apartamento vago hoje: conta até hoje e marca como em andamento', () => {
    const tenantInfo = new Map([['t1', { apartmentId: 'a1', name: 'Luis' }]]);
    const r = computeVacancy(input({
      apartments: [apartments[0]],
      tenantInfo,
      contracts: [{ tenant_id: 't1', start_date: '2025-07-14', end_date: '2026-09-14', rent_value: 600 }],
    }));
    expect(r.vacantNow).toBe(1);
    expect(r.entries.map(e => [e.month, e.days])).toEqual([[8, 16], [9, 7]]); // 15/09–30/09 e 01/10–07/10
    expect(r.entries[1].ongoing).toBe(true);
    expect(r.entries[0].ongoing).toBe(false);
  });

  it('contratos sobrepostos (ex.: teste) não geram vacância', () => {
    const tenantInfo = new Map([
      ['t1', { apartmentId: 'a1', name: 'Francisca' }],
      ['t2', { apartmentId: 'a1', name: 'Teste' }],
    ]);
    const r = computeVacancy(input({
      apartments: [apartments[0]],
      tenantInfo,
      contracts: [
        { tenant_id: 't1', start_date: '2025-12-02', end_date: null, rent_value: 600 },
        { tenant_id: 't2', start_date: '2026-01-01', end_date: '2026-03-04', rent_value: 600 },
      ],
    }));
    expect(r.entries).toHaveLength(0);
    expect(r.vacantNow).toBe(0);
  });

  it('antes do primeiro contrato conta como vago a partir de 1º de janeiro', () => {
    const tenantInfo = new Map([['t1', { apartmentId: 'a1', name: 'Renato' }]]);
    const r = computeVacancy(input({
      apartments: [apartments[0]],
      tenantInfo,
      contracts: [{ tenant_id: 't1', start_date: '2026-02-06', end_date: null, rent_value: 600 }],
    }));
    expect(r.entries.map(e => [e.month, e.days])).toEqual([[0, 31], [1, 5]]);
    expect(r.entries[0].reason).toContain('sem contrato anterior');
  });

  it('apartamento sem nenhum contrato usa a média do condomínio e fica vago o ano todo', () => {
    const tenantInfo = new Map([['t1', { apartmentId: 'a2', name: 'Joana' }]]);
    const r = computeVacancy(input({
      tenantInfo,
      contracts: [{ tenant_id: 't1', start_date: '2020-01-01', end_date: null, rent_value: 800 }],
    }));
    const a1 = r.entries.filter(e => e.aptId === 'a1');
    expect(a1[0].rent).toBe(800);
    expect(a1.reduce((s, e) => s + e.days, 0)).toBe(280); // 01/01 a 07/10 de 2026
  });

  it('contrato futuro não conta como ocupado hoje', () => {
    const tenantInfo = new Map([['t1', { apartmentId: 'a1', name: 'Futuro' }]]);
    const r = computeVacancy(input({
      apartments: [apartments[0]],
      tenantInfo,
      contracts: [{ tenant_id: 't1', start_date: '2026-11-01', end_date: null, rent_value: 600 }],
    }));
    expect(r.vacantNow).toBe(1);
  });

  it('ano passado considera o ano inteiro', () => {
    const r = computeVacancy(input({ year: 2025, apartments: [apartments[0]] }));
    expect(r.entries.reduce((s, e) => s + e.days, 0)).toBe(365);
    expect(r.vacantNow).toBe(0); // "hoje" não pertence a 2025
  });
});
