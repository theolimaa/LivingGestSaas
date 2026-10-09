import { getRecordStatus, getRecordDueDate } from '@/lib/utils-app';
import { useAllFinancialRecords } from './useFinancial';
import { useContracts } from './useContracts';
import { useTenants } from './useTenants';
import { useApartments } from './useApartments';
import { useCondominiums } from './useCondominiums';

export interface OverdueSummaryItem {
  apartmentId: string;
  condominiumId: string;
  condominiumName: string;
  aptUnit: string;
  tenantName: string;
  tenantPhone: string | null;
  totalOverdue: number;
  daysOverdue: number;
  oldestDueDate: string;
}

/** Inadimplência "de hoje" — indepentende do filtro de mês/ano global.
 *  Um registro conta como inadimplente quando está vencido (getRecordStatus)
 *  e o contrato correspondente nao foi encerrado. Agrupado por apartamento,
 *  somando o valor de todos os meses em aberto e usando o vencimento mais
 *  antigo para calcular os dias de atraso. */
export function useOverdueSummary() {
  const { data: financialRecords = [], isLoading: l1 } = useAllFinancialRecords();
  const { data: contracts = [], isLoading: l2 } = useContracts();
  const { data: allTenants = [], isLoading: l3 } = useTenants();
  const { data: apartments = [], isLoading: l4 } = useApartments();
  const { data: condominiums = [], isLoading: l5 } = useCondominiums();

  const isLoading = l1 || l2 || l3 || l4 || l5;

  const byApartment = new Map<string, OverdueSummaryItem>();
  // Registros individuais em atraso (vencimento + valor), pra filtrar por período
  const records: { apartmentId: string; dueDate: string; value: number }[] = [];

  for (const r of financialRecords) {
    if (r.paid) continue;
    const contract = r.contract_id ? contracts.find(c => c.id === r.contract_id) : undefined;
    if (contract?.status === 'ended') continue;

    const status = getRecordStatus(r.month, contract?.payment_day, contract?.start_date, contract?.desired_payment_day, contract?.desired_payment_date);
    if (status !== 'overdue') continue;

    const apt = apartments.find(a => a.id === r.apartment_id);
    if (!apt) continue;
    const tenant = allTenants.find(t => t.id === r.tenant_id) ?? allTenants.find(t => t.apartment_id === apt.id);
    if (!tenant) continue;
    const condo = condominiums.find(c => c.id === apt.condominium_id);
    const dueDateStr = getRecordDueDate(r.month, contract?.start_date, contract?.payment_day, contract?.desired_payment_day, contract?.desired_payment_date);

    records.push({ apartmentId: apt.id, dueDate: dueDateStr, value: r.rent_value });

    const existing = byApartment.get(apt.id);
    if (existing) {
      existing.totalOverdue += r.rent_value;
      if (dueDateStr < existing.oldestDueDate) existing.oldestDueDate = dueDateStr;
    } else {
      byApartment.set(apt.id, {
        apartmentId: apt.id,
        condominiumId: apt.condominium_id,
        condominiumName: condo?.name ?? '',
        aptUnit: apt.unit_number,
        tenantName: `${tenant.first_name} ${tenant.last_name}`,
        tenantPhone: tenant.phone,
        totalOverdue: r.rent_value,
        daysOverdue: 0,
        oldestDueDate: dueDateStr,
      });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = Array.from(byApartment.values())
    .map(item => {
      const [y, m, d] = item.oldestDueDate.split('-').map(Number);
      const due = new Date(y, m - 1, d);
      const daysOverdue = Math.round((today.getTime() - due.getTime()) / 86400000);
      return { ...item, daysOverdue };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    items,
    records,
    totalCount: items.length,
    totalValue: items.reduce((s, i) => s + i.totalOverdue, 0),
    isLoading,
  };
}
