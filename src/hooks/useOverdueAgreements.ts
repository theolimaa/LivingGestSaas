import { useAllDebtAgreements, useAllDebtInstallments } from './useDebtAgreements';
import { useAllPreviousTenants } from './useTenants';
import { useApartments } from './useApartments';
import { useCondominiums } from './useCondominiums';

export interface OverdueAgreementItem {
  previousTenantId: string;
  condominiumName: string;
  aptUnit: string;
  tenantName: string;
  totalOverdue: number;
  overdueCount: number;
  daysOverdue: number;
  oldestDueDate: string;
}

/** Inadimplência de acordos de dívida: parcelas não pagas, com vencimento
 *  anterior a hoje, de acordos ativos. Agrupado por ex-inquilino, somando as
 *  parcelas vencidas e usando a mais antiga para calcular os dias de atraso. */
export function useOverdueAgreements() {
  const { data: agreements = [], isLoading: l1 } = useAllDebtAgreements();
  const { data: installments = [], isLoading: l2 } = useAllDebtInstallments();
  const { data: previousTenants = [], isLoading: l3 } = useAllPreviousTenants();
  const { data: apartments = [], isLoading: l4 } = useApartments();
  const { data: condominiums = [], isLoading: l5 } = useCondominiums();

  const isLoading = l1 || l2 || l3 || l4 || l5;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const activeIds = new Set(agreements.filter(a => a.status === 'active').map(a => a.id));
  const byTenant = new Map<string, OverdueAgreementItem>();

  for (const inst of installments) {
    if (inst.paid || !inst.due_date || inst.due_date >= todayStr) continue;
    if (!activeIds.has(inst.agreement_id)) continue;

    const ptId = inst.debt_agreements.previous_tenant_id;
    const existing = byTenant.get(ptId);
    if (existing) {
      existing.totalOverdue += inst.amount;
      existing.overdueCount += 1;
      if (inst.due_date < existing.oldestDueDate) existing.oldestDueDate = inst.due_date;
      continue;
    }

    const pt = previousTenants.find(p => p.id === ptId);
    if (!pt) continue;
    const apt = apartments.find(a => a.id === inst.debt_agreements.apartment_id);
    const condo = condominiums.find(c => c.id === apt?.condominium_id);
    byTenant.set(ptId, {
      previousTenantId: ptId,
      condominiumName: condo?.name ?? '',
      aptUnit: apt?.unit_number ?? '',
      tenantName: `${pt.first_name} ${pt.last_name}`,
      totalOverdue: inst.amount,
      overdueCount: 1,
      daysOverdue: 0,
      oldestDueDate: inst.due_date,
    });
  }

  const items = Array.from(byTenant.values())
    .map(item => {
      const [y, m, d] = item.oldestDueDate.split('-').map(Number);
      const due = new Date(y, m - 1, d);
      return { ...item, daysOverdue: Math.round((today.getTime() - due.getTime()) / 86400000) };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    items,
    totalCount: items.length,
    totalValue: items.reduce((s, i) => s + i.totalOverdue, 0),
    isLoading,
  };
}
