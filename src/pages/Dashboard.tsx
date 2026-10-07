import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, TrendingUp, TrendingDown, DollarSign, ArrowUpDown, AlertTriangle, ChevronRight, History, Handshake, Clock, Target, Award } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDate, MONTHS, YEARS, getRecordStatus, getPeriodAndDueDate } from '@/lib/utils-app';
import { useApp } from '@/lib/store';
import GlobalFilter from '@/components/GlobalFilter';
import Layout from '@/components/Layout';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useAllFinancialRecords, FinancialRecordDB, calcReceived, calcOwed } from '@/hooks/useFinancial';
import { useContracts } from '@/hooks/useContracts';
import { useTenants, useAllPreviousTenants } from '@/hooks/useTenants';
import { useAllDebtInstallments, useAllDebtAgreements } from '@/hooks/useDebtAgreements';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
 
function getStatus(
  record: FinancialRecordDB,
  paymentDay?: number | null,
  contractStartDate?: string | null,
  desiredPaymentDay?: number | null,
  desiredPaymentDate?: string | null
): 'paid' | 'overdue' | 'pending' {
  if (record.paid) return 'paid';
  return getRecordStatus(record.month, paymentDay, contractStartDate, desiredPaymentDay, desiredPaymentDate);
}
 
function getDueDateMonth(record: FinancialRecordDB, contract?: { start_date?: string | null; payment_day?: number | null; desired_payment_day?: number | null; desired_payment_date?: string | null } | null): string | null {
  if (!contract) return null;
  const { dueDateLabel } = getPeriodAndDueDate(record.month, contract.start_date ?? null, contract.payment_day ?? 1, contract.desired_payment_day, contract.desired_payment_date);
  if (!dueDateLabel || dueDateLabel === '-') return null;
  const parts = dueDateLabel.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}`;
}
 
function getDescription(r: any): string {
  if (r._type === 'caution' || r.status === 'Caução') return 'Caução';
  if (r.status === 'Acordo' || r.observations?.startsWith('Parcela')) return 'Acordo';
  if (!r.paid) return 'Aluguel';
  if (calcOwed(r) > 0) return 'Parcial';
  return 'Aluguel';
}

type ModalSortField = 'condo' | 'apt' | 'date';
type ModalSortDir = 'asc' | 'desc';
 
function DetailModal({ open, onClose, title, records, tenants, apartments, condominiums, variant }: {
  open: boolean; onClose: () => void; title: string;
  records: (FinancialRecordDB & { computedStatus: string; isFormer?: boolean })[]; tenants: { id: string; first_name: string; last_name: string }[];
  apartments: { id: string; unit_number: string; condominium_id: string }[]; condominiums: { id: string; name: string }[];
  variant: 'pending' | 'overdue' | 'received' | 'debt';
}) {
  const [sortField, setSortField] = useState<ModalSortField | null>(null);
  const [sortDir, setSortDir] = useState<ModalSortDir>('asc');
  const { data: contracts = [] } = useContracts();
 
  function toggleSort(field: ModalSortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }
 
  function parseDateForSort(dateStr: string): string {
    if (!dateStr || dateStr === '-') return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/');
      return `${y}-${m}-${d}`;
    }
    return dateStr;
  }
 
  const enriched = records.map(r => {
    const apt = apartments.find(a => a.id === r.apartment_id);
    const condo = apt ? condominiums.find(c => c.id === apt.condominium_id) : null;
    const contract = contracts.find(ct => ct.id === r.contract_id);
    let dateCol: string;
    if (variant === 'received') {
      dateCol = r.payment_date ?? '-';
    } else if (variant === 'debt') {
      dateCol = r.paid ? (r.payment_date ?? '-') : (r.month ?? '-');
    } else if ((r as any)._dueDateLabel) {
      dateCol = (r as any)._dueDateLabel;
    } else {
      const { dueDateLabel } = getPeriodAndDueDate(r.month, contract?.start_date ?? null, contract?.payment_day ?? 1, contract?.desired_payment_day, contract?.desired_payment_date);
      dateCol = dueDateLabel;
    }
    return { ...r, apt, condo, dateCol };
  });
 
  const sorted = sortField ? [...enriched].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'condo') cmp = (a.condo?.name ?? '').localeCompare(b.condo?.name ?? '');
    else if (sortField === 'apt') cmp = (a.apt?.unit_number ?? '').localeCompare(b.apt?.unit_number ?? '', undefined, { numeric: true });
    else if (sortField === 'date') cmp = parseDateForSort(a.dateCol).localeCompare(parseDateForSort(b.dateCol));
    return sortDir === 'asc' ? cmp : -cmp;
  }) : enriched;
 
  const lastColLabel = variant === 'received' ? 'Data Pagamento' : variant === 'debt' ? 'Referência' : 'Vencimento';
 
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum registro encontrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('condo')}>
                      Condomínio <ArrowUpDown className={`w-3 h-3 ${sortField === 'condo' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('apt')}>
                      Apto <ArrowUpDown className={`w-3 h-3 ${sortField === 'apt' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Inquilino</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Tipo</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('date')}>
                      {lastColLabel} <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const t = tenants.find(t => t.id === r.tenant_id);
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm">{r.condo?.name ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm font-medium">{r.apt?.unit_number ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm">
                        <span>{t ? `${t.first_name} ${t.last_name}` : '-'}</span>
                        {variant === 'debt' && r.isFormer && (
                          <Link to="/anteriores" onClick={onClose} className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded px-1 py-0.5">
                            <History className="w-2.5 h-2.5" /> anterior
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm hidden md:table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          getDescription(r) === 'Caução'  ? 'bg-accent text-accent-foreground' :
                          getDescription(r) === 'Acordo'  ? 'bg-primary/10 text-primary' :
                          getDescription(r) === 'Parcial' ? 'bg-warning/15 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>{getDescription(r)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-sm">{formatCurrency(variant === 'received' ? calcReceived(r) : variant === 'debt' ? (!r.paid ? r.rent_value : calcOwed(r)) : r.rent_value)}</td>
                      <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{r.dateCol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
 
export default function Dashboard() {
  const { state } = useApp();
  const [pendingModal, setPendingModal] = useState(false);
  const [overdueModal, setOverdueModal] = useState(false);
  const [receivedModal, setReceivedModal] = useState(false);
  const [debtModal, setDebtModal] = useState(false);

  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: financialRecords = [] } = useAllFinancialRecords();
  const { data: contracts = [] } = useContracts();
  const { data: allTenants = [] } = useTenants();
  const { data: previousTenants = [] } = useAllPreviousTenants();
  const { data: debtInstallments = [] } = useAllDebtInstallments();
  const { data: allDebtAgreements = [] } = useAllDebtAgreements();

  const { selectedYear, selectedMonth } = state;
  const [chartYear, setChartYear] = useState(String(selectedYear));
  const [chartCondo, setChartCondo] = useState<string>('all');
 
  const selectedMonthKey = selectedMonth !== null
    ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
    : null;
 
  const contractByApartment = new Map<string, typeof contracts[0]>();
  for (const tenant of allTenants) {
    if (!tenant.apartment_id) continue;
    const c = contracts.find(ct => ct.tenant_id === tenant.id);
    if (c) contractByApartment.set(tenant.apartment_id, c);
  }
 
  const enrichedRecords = financialRecords.flatMap(r => {
    const contract =
      (r.contract_id ? contracts.find(c => c.id === r.contract_id) : undefined) ??
      contractByApartment.get(r.apartment_id);
 
    if (contract?.start_date) {
      if (r.month < contract.start_date.substring(0, 7)) return [];
    }
 
    // Registros nao pagos de contratos encerrados nao devem aparecer nos totais
    if (!r.paid && contract?.status === 'ended') return [];
 
    const status = getStatus(r, contract?.payment_day, contract?.start_date, contract?.desired_payment_day, contract?.desired_payment_date);
    const dueDateMonth = getDueDateMonth(r, contract);
    const paymentMonth = r.payment_date ? r.payment_date.substring(0, 7) : null;
    return [{ ...r, computedStatus: status, dueDateMonth, paymentMonth }];
  });
 
  const receivedRecords = enrichedRecords.filter(r => {
    if (!r.paid || !r.paymentMonth) return false;
    if (selectedMonthKey) return r.paymentMonth === selectedMonthKey;
    return r.paymentMonth.startsWith(String(selectedYear));
  });
 
  const pendingRecords = enrichedRecords.filter(r => {
    if (r.computedStatus !== 'pending') return false;
    if (selectedMonthKey) return r.dueDateMonth === selectedMonthKey;
    return r.dueDateMonth?.startsWith(String(selectedYear)) ?? false;
  });
 
  const overdueRecords = enrichedRecords.filter(r => {
    if (r.computedStatus !== 'overdue') return false;
    if (selectedMonthKey) return r.dueDateMonth === selectedMonthKey;
    return r.dueDateMonth?.startsWith(String(selectedYear)) ?? false;
  });
 
  const totalReceived = receivedRecords.reduce((s, r) => s + calcReceived(r), 0);

  // Cauções pagas no período selecionado — contam como receita
  const cautionRows = contracts
    .filter(c => {
      if (!c.caution_paid || !c.caution_date || !(c.caution_value > 0)) return false;
      const pm = c.caution_date.substring(0, 7);
      if (selectedMonthKey) return pm === selectedMonthKey;
      return pm.startsWith(String(selectedYear));
    })
    .flatMap(c => {
      const tenant = allTenants.find(t => t.id === c.tenant_id);
      const aptId = tenant?.apartment_id ?? '';
      if (!aptId) return [];
      return [{
        id: `caution_${c.id}`,
        apartment_id: aptId,
        tenant_id: c.tenant_id ?? '',
        contract_id: c.id,
        month: c.caution_date!.substring(0, 7),
        rent_value: c.caution_value,
        paid: true,
        paid_amount: c.caution_value,
        payment_date: c.caution_date!,
        payment_method: null,
        debt_paid_amount: null, debt_payment_date: null, debt_payment_method: null,
        status: 'Caução', observations: null, receipt_number: null, receipt_generated_at: null,
        created_at: null, updated_at: null,
        computedStatus: 'paid', paymentMonth: c.caution_date!.substring(0, 7), dueDateMonth: null,
        _type: 'caution',
      } as any];
    });
  const totalCautionReceived = cautionRows.reduce((s: number, r: any) => s + r.rent_value, 0);
  const totalPending = pendingRecords.reduce((s, r) => s + r.rent_value, 0);
  const totalOverdue = overdueRecords.reduce((s, r) => s + r.rent_value, 0);
 
  // IDs de inquilinos anteriores para marcar dívidas de ex-inquilinos
  const previousTenantIds = new Set(previousTenants.map(pt => pt.original_id).filter(Boolean));

  const debtRecords = enrichedRecords.filter(r => {
    if (!r.paid || !r.paymentMonth) return false;
    const owed = calcOwed(r);
    if (owed <= 0) return false;
    if (selectedMonthKey) return r.paymentMonth === selectedMonthKey;
    return r.paymentMonth.startsWith(String(selectedYear));
  }).map(r => ({
    ...r,
    isFormer: previousTenantIds.has(r.tenant_id ?? ''),
  }));
  const totalOwed = debtRecords.reduce((s, r) => s + calcOwed(r), 0);

  // Registros NÃO PAGOS de ex-inquilinos SEM acordo ativo também entram no Devendo
  // (não duplica: quem tem acordo ativo usa agreementsOwed, não este)
  const activeAgreementTenantIds = new Set(
    allDebtAgreements
      .filter(ag => ag.status === 'active')
      .map(ag => previousTenants.find(pt => pt.id === ag.previous_tenant_id)?.original_id)
      .filter(Boolean)
  );
  // Acordos quitados ou cancelados = dívida zerada (perdoada ou encerrada)
  const settledAgreementTenantIds = new Set(
    allDebtAgreements
      .filter(ag => ag.status === 'settled' || ag.status === 'cancelled')
      .map(ag => previousTenants.find(pt => pt.id === ag.previous_tenant_id)?.original_id)
      .filter(Boolean)
  );
  // Linhas sintéticas de acordos ativos para o modal "Ver detalhes" do Devendo
  const agreementModalRows = allDebtAgreements
    .filter(ag => ag.status === 'active')
    .flatMap(ag => {
      const prevTenant = previousTenants.find((pt: any) => pt.id === ag.previous_tenant_id);
      if (!prevTenant) return [];
      const paidSoFar = debtInstallments
        .filter((i: any) => i.agreement_id === ag.id && i.paid)
        .reduce((s: number, i: any) => s + i.amount, 0);
      const remaining = Math.max(0, ag.agreed_amount - paidSoFar);
      if (remaining <= 0) return [];
      return [{
        id: `agreement_${ag.id}`,
        apartment_id: ag.apartment_id,
        tenant_id: (prevTenant as any).original_id ?? '',
        contract_id: null,
        month: new Date().toISOString().substring(0, 7),
        rent_value: remaining,
        paid: false, paid_amount: null, payment_date: null, payment_method: null,
        debt_paid_amount: null, debt_payment_date: null, debt_payment_method: null,
        status: 'Acordo', observations: null,
        receipt_number: null, receipt_generated_at: null, created_at: null, updated_at: null,
        computedStatus: 'overdue', paymentMonth: null, dueDateMonth: null, isFormer: true,
        _type: 'agreement',
      } as any];
    });

  // Registros de ex-inquilinos com saldo devedor — sem filtro de data (dívida cumulativa)
  // Inclui tanto registros não pagos (paid=false) quanto pagos parcialmente (paid=true, calcOwed>0)
  // Exclui registros já contados em debtRecords (para evitar duplicação)
  const debtRecordIds = new Set(debtRecords.map(r => r.id));

  const formerUnpaidRecordsForModal = financialRecords
    .filter(r => {
      if (!previousTenantIds.has(r.tenant_id ?? '')) return false;
      if (activeAgreementTenantIds.has(r.tenant_id ?? '')) return false;
      if (settledAgreementTenantIds.has(r.tenant_id ?? '')) return false;
      if (debtRecordIds.has(r.id)) return false; // já em debtRecords — não duplicar
      const owed = !r.paid ? r.rent_value : calcOwed(r);
      return owed > 0;
    })
    .map(r => ({ ...r, computedStatus: 'overdue' as const, isFormer: true, dueDateMonth: null, paymentMonth: null }));

  const formerUnpaidOwed = formerUnpaidRecordsForModal.reduce((s, r) => {
    const owed = !r.paid ? r.rent_value : calcOwed(r);
    return s + owed;
  }, 0);

  // Saldo restante de acordos de dívida ativos entra no Devendo
  const agreementsOwed = allDebtAgreements
    .filter(ag => ag.status === 'active')
    .reduce((s, ag) => {
      const paid = debtInstallments
        .filter(i => i.agreement_id === ag.id && i.paid)
        .reduce((sum, i) => sum + i.amount, 0);
      return s + Math.max(0, ag.agreed_amount - paid);
    }, 0);
  const totalOwedAll = totalOwed + agreementsOwed + formerUnpaidOwed;


  // Parcelas não pagas de acordos — entram em "A Receber" com suas datas
  const pendingInstallmentRows = debtInstallments
    .filter(inst => {
      if (inst.paid) return false;
      if (!inst.due_date) return false;
      const y = Number(inst.due_date.split('-')[0]);
      if (selectedMonthKey) return inst.due_date.startsWith(selectedMonthKey);
      return y === selectedYear;
    })
    .map(inst => {
      const ag = allDebtAgreements.find(a => a.id === inst.agreement_id);
      const pt = previousTenants.find(p => p.id === ag?.previous_tenant_id);
      const apt = apartments.find(a => a.id === ag?.apartment_id);
      const condo = condominiums.find(c => c.id === apt?.condominium_id);
      // Create a shape compatible with DetailModal rows
      return {
        id: inst.id,
        apartment_id: ag?.apartment_id ?? '',
        tenant_id: pt?.original_id ?? '',
        contract_id: null,
        month: inst.due_date?.substring(0, 7) ?? '',
        rent_value: inst.amount,
        paid: false,
        payment_date: null,
        paid_amount: null,
        payment_method: null,
        debt_paid_amount: null,
        debt_payment_date: null,
        debt_payment_method: null,
        status: 'Acordo',
        observations: `Parcela ${inst.installment_number}/${ag?.installment_count ?? '?'} do acordo`,
        receipt_number: null,
        receipt_generated_at: null,
        created_at: null,
        updated_at: null,
        computedStatus: 'pending',
        isFormer: true,
        // Extra for display
        _tenantName: pt ? `${pt.first_name} ${pt.last_name}` : '—',
        _condoName: condo?.name ?? '—',
        _aptUnit: apt?.unit_number ?? '—',
        _isDue: true,
        _dueDateLabel: inst.due_date!.split('-').reverse().join('/'),
      } as any;
    });

  const totalPendingAll = totalPending + pendingInstallmentRows.reduce((s, r) => s + r.rent_value, 0);

  // Parcelas de acordos pagas no mês selecionado contam como receita
  const paidInstallmentsThisMonth = debtInstallments.filter(inst => {
    if (!inst.paid || !inst.payment_date) return false;
    if (selectedMonthKey) return inst.payment_date.startsWith(selectedMonthKey);
    return inst.payment_date.startsWith(String(selectedYear));
  });
  const paidInstallmentRows = paidInstallmentsThisMonth.map(inst => {
    const ag = allDebtAgreements.find(a => a.id === inst.agreement_id);
    const pt = previousTenants.find(p => p.id === ag?.previous_tenant_id);
    // Create a shape compatible with DetailModal rows
    return {
      id: inst.id,
      apartment_id: ag?.apartment_id ?? '',
      tenant_id: pt?.original_id ?? '',
      contract_id: null,
      month: inst.payment_date?.substring(0, 7) ?? '',
      rent_value: inst.amount,
      paid: true,
      payment_date: inst.payment_date,
      paid_amount: null,
      payment_method: inst.payment_method,
      debt_paid_amount: null,
      debt_payment_date: null,
      debt_payment_method: null,
      status: 'Acordo',
      observations: `Parcela ${inst.installment_number}/${ag?.installment_count ?? '?'} do acordo`,
      receipt_number: null,
      receipt_generated_at: null,
      created_at: null,
      updated_at: null,
      computedStatus: 'paid',
      paymentMonth: inst.payment_date?.substring(0, 7) ?? null,
      isFormer: true,
    } as any;
  });
  const installmentsRevenue = paidInstallmentRows.reduce((s, r) => s + r.rent_value, 0);
 
  const chartData = MONTHS.map((month, idx) => {
    const monthKey = `${chartYear}-${String(idx + 1).padStart(2, '0')}`;
    const matchCondo = (r: typeof enrichedRecords[0]) =>
      chartCondo === 'all' || apartments.find(a => a.id === r.apartment_id)?.condominium_id === chartCondo;
 
    const rec = enrichedRecords.filter(r => r.paid && r.paymentMonth === monthKey && matchCondo(r)).reduce((s, r) => s + calcReceived(r), 0);
    const pend = enrichedRecords.filter(r => r.computedStatus === 'pending' && r.dueDateMonth === monthKey && matchCondo(r)).reduce((s, r) => s + r.rent_value, 0);
    const over = enrichedRecords.filter(r => r.computedStatus === 'overdue' && r.dueDateMonth === monthKey && matchCondo(r)).reduce((s, r) => s + r.rent_value, 0);
    return { month: month.substring(0, 3), receita: rec, aReceber: pend, inadimplente: over };
  });
 
  const filterLabel = selectedMonth !== null ? MONTHS[selectedMonth] : 'Ano';
 
  // Count occupied apts
  const occupiedCount = apartments.filter(a => allTenants.some(t => t.apartment_id === a.id)).length;
  // ── KPIs ─────────────────────────────────────────────────────────────────

  // 1. Taxa de inadimplência
  const overdueAptIds = new Set(overdueRecords.map(r => r.apartment_id));
  const taxaInadimplencia = occupiedCount > 0
    ? Math.round((overdueAptIds.size / occupiedCount) * 100)
    : 0;

  // 2. Eficiência de recebimento
  const expectedTotal = totalReceived + totalPending + totalOverdue;
  const eficienciaRecebimento = expectedTotal > 0
    ? Math.round((totalReceived / expectedTotal) * 100)
    : 100;

  // 3. Tempo médio de atraso — usa dueDateMonth (YYYY-MM) como proxy do vencimento
  const delayDays = receivedRecords
    .filter(r => r.payment_date && r.dueDateMonth)
    .map(r => {
      // dueDateMonth = "YYYY-MM", assume vencimento no dia do paymentDay do contrato
      const contract = contracts.find(c => c.id === r.contract_id);
      const day = contract?.payment_day ?? 5;
      const [y, m] = r.dueDateMonth!.split('-').map(Number);
      const dueDate = new Date(y, m - 1, day);
      const paidDate = new Date(r.payment_date!);
      return Math.max(0, Math.round((paidDate.getTime() - dueDate.getTime()) / 86400000));
    })
    .filter(d => d > 0);
  const tempoMedioAtraso = delayDays.length > 0
    ? Math.round(delayDays.reduce((s, d) => s + d, 0) / delayDays.length)
    : 0;
  const pctAtraso = receivedRecords.length > 0
    ? Math.round((delayDays.length / receivedRecords.length) * 100)
    : 0;

  // 4. Cobertura de acordos
  const formerWithDebt = previousTenants.filter(pt =>
    financialRecords.some(r => r.tenant_id === pt.original_id && !r.paid) ||
    allDebtAgreements.some(a => a.previous_tenant_id === pt.id)
  );
  const formerWithAgreement = formerWithDebt.filter(pt =>
    allDebtAgreements.some(a => a.previous_tenant_id === pt.id && (a.status === 'active' || a.status === 'settled'))
  );
  const coberturaAcordos = formerWithDebt.length > 0
    ? Math.round((formerWithAgreement.length / formerWithDebt.length) * 100)
    : 100;

  // 5. Taxa de cumprimento de acordos
  const nowDate = new Date();
  const duedInstallments = debtInstallments.filter(i => i.due_date && new Date(i.due_date) <= nowDate);
  const paidOnDueInstallments = duedInstallments.filter(i => i.paid);
  const taxaCumprimentoAcordos = duedInstallments.length > 0
    ? Math.round((paidOnDueInstallments.length / duedInstallments.length) * 100)
    : 100;

  // 6. Ticket médio por unidade ocupada
  const aptRentMap = new Map<string, number>();
  financialRecords.forEach(r => {
    if (!aptRentMap.has(r.apartment_id) && allTenants.some(t => t.apartment_id === r.apartment_id))
      aptRentMap.set(r.apartment_id, r.rent_value);
  });
  const ticketMedio = aptRentMap.size > 0
    ? Array.from(aptRentMap.values()).reduce((s, v) => s + v, 0) / aptRentMap.size
    : 0;
 
  return (
    <Layout>
      <div className="page-content">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Visão geral — {filterLabel} {selectedYear}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <GlobalFilter />
            </div>
          </div>
          <div className="sm:hidden">
            <GlobalFilter />
          </div>
        </div>
 
        {/* ── KPI Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 stagger-children">
          {/* Receita Recebida */}
          <div
            className="stat-card stat-card-paid cursor-pointer"
            onClick={() => setReceivedModal(true)}
          >
            <div className="flex items-center justify-between mb-3 relative z-10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recebido</p>
              <div className="icon-badge icon-badge-success">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl md:text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--paid))' }}>
              {formatCurrency(totalReceived + totalCautionReceived + installmentsRevenue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 relative z-10 flex items-center gap-1">
              Ver detalhes <ChevronRight className="w-3 h-3" />
            </p>
          </div>
 
          {/* A Receber */}
          <div
            className="stat-card stat-card-warning cursor-pointer"
            onClick={() => setPendingModal(true)}
          >
            <div className="flex items-center justify-between mb-3 relative z-10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">A Receber</p>
              <div className="icon-badge icon-badge-warning">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl md:text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--warning))' }}>
              {formatCurrency(totalPendingAll)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 relative z-10 flex items-center gap-1">
              Ver detalhes <ChevronRight className="w-3 h-3" />
            </p>
          </div>
 
          {/* Inadimplente */}
          <div
            className="stat-card stat-card-danger cursor-pointer"
            onClick={() => setOverdueModal(true)}
          >
            <div className="flex items-center justify-between mb-3 relative z-10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inadimplente</p>
              <div className="icon-badge icon-badge-danger">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl md:text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--overdue))' }}>
              {formatCurrency(totalOverdue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 relative z-10 flex items-center gap-1">
              Ver detalhes <ChevronRight className="w-3 h-3" />
            </p>
          </div>
 
          {/* Devendo */}
          <div
            className="stat-card stat-card-danger cursor-pointer"
            onClick={() => setDebtModal(true)}
          >
            <div className="flex items-center justify-between mb-3 relative z-10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Devendo</p>
              <div className="icon-badge icon-badge-danger">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p
              className="text-xl md:text-2xl font-bold relative z-10"
              style={{ color: totalOwedAll > 0 ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }}
            >
              {formatCurrency(totalOwedAll)}
            </p>
            {/* Breakdown atual vs anterior */}
            {totalOwedAll > 0 && (() => {
              const formerOwed = debtRecords.filter(r => r.isFormer).reduce((s, r) => s + calcOwed(r), 0) + formerUnpaidOwed;
              const currentOwed = totalOwedAll - formerOwed - agreementsOwed;
              return (
                <div className="mt-1.5 relative z-10 space-y-0.5">
                  {currentOwed > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Home className="w-3 h-3" /> Atuais: {formatCurrency(currentOwed)}
                    </p>
                  )}
                  {formerOwed > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <History className="w-3 h-3" /> Anteriores: {formatCurrency(formerOwed)}
                    </p>
                  )}
                  {agreementsOwed > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Handshake className="w-3 h-3" /> Acordos: {formatCurrency(agreementsOwed)}
                    </p>
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground mt-1.5 relative z-10 flex items-center gap-1">
              Ver detalhes <ChevronRight className="w-3 h-3" />
            </p>
          </div>
 
          {/* Apartamentos */}
          <div className="stat-card stat-card-primary">
            <div className="flex items-center justify-between mb-3 relative z-10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unidades</p>
              <div className="icon-badge icon-badge-primary">
                <Home className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl md:text-2xl font-bold relative z-10">{apartments.length}</p>
            <p className="text-xs text-muted-foreground mt-1.5 relative z-10">
              {occupiedCount} ocupadas · {apartments.length - occupiedCount} vagas
            </p>
          </div>
        </div>
 
        {/* ── Chart ──────────────────────────────────────────────────── */}
        <div className="chart-container">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="section-title">Receita Mensal</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Recebido vs A Receber vs Inadimplente</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={chartCondo} onValueChange={setChartCondo}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {condominiums.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={chartYear} onValueChange={setChartYear}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
              />
              <RechartsTooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
                }}
                cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              />
              <Bar dataKey="receita" name="Recebido" fill="hsl(142 72% 42%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aReceber" name="A Receber" fill="hsl(37 95% 48%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inadimplente" name="Inadimplente" fill="hsl(0 84% 58%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
 
      </div>

      {/* Modals */}
      <DetailModal
        open={debtModal}
        onClose={() => setDebtModal(false)}
        title={`Devendo — ${filterLabel} ${selectedYear}`}
        records={[...debtRecords, ...formerUnpaidRecordsForModal, ...agreementModalRows]}
        tenants={[
          ...allTenants,
          ...previousTenants.map(pt => ({ id: pt.original_id ?? '', first_name: pt.first_name, last_name: pt.last_name })),
        ]}
        apartments={apartments}
        condominiums={condominiums}
        variant="debt"
      />
 
      <DetailModal open={pendingModal} onClose={() => setPendingModal(false)} title={`A Receber — ${filterLabel} ${selectedYear}`} records={[...pendingRecords, ...pendingInstallmentRows]} tenants={[...allTenants, ...previousTenants.map(pt => ({ id: pt.original_id ?? '', first_name: pt.first_name, last_name: pt.last_name }))]} apartments={apartments} condominiums={condominiums} variant="pending" />
      <DetailModal open={overdueModal} onClose={() => setOverdueModal(false)} title={`Inadimplentes — ${filterLabel} ${selectedYear}`} records={overdueRecords} tenants={allTenants} apartments={apartments} condominiums={condominiums} variant="overdue" />
      <DetailModal open={receivedModal} onClose={() => setReceivedModal(false)} title={`Receita Recebida — ${filterLabel} ${selectedYear}`} records={[...receivedRecords, ...cautionRows, ...paidInstallmentRows]} tenants={[...allTenants, ...previousTenants.map(pt => ({ id: pt.original_id ?? '', first_name: pt.first_name, last_name: pt.last_name }))]} apartments={apartments} condominiums={condominiums} variant="received" />
    </Layout>
  );
}
