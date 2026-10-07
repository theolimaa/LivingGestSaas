import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp, DollarSign, TrendingDown, CheckCircle, AlertCircle,
  Receipt, Loader2, ArrowUpDown, XCircle, CalendarDays, Banknote,
  Wallet, AlertTriangle, Handshake,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { KpiCard } from '@/components/app/KpiCard';
import { StatusBadge } from '@/components/app/StatusBadge';
import { formatCurrency, MONTHS, YEARS, getPeriodAndDueDate, computeRecordStatus, getRecordDueDate } from '@/lib/utils-app';
import Layout from '@/components/Layout';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import {
  useAllFinancialRecords, useUpsertFinancialRecord, FinancialRecordDB,
  calcReceived, calcOwed,
} from '@/hooks/useFinancial';
import { useContracts } from '@/hooks/useContracts';
import { useAllDebtAgreements, useAllDebtInstallments } from '@/hooks/useDebtAgreements';
import ReceiptModalDB from '@/components/apartment/ReceiptModalDB';
 
type PaymentMethod = 'pix' | 'especie';

type SortField = 'condo' | 'apt' | 'tenant' | 'period' | 'status' | 'payment_date';
type SortDir = 'asc' | 'desc';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'overdue', label: 'Inadimplentes' },
  { value: 'pending', label: 'A Receber' },
  { value: 'paid', label: 'Pagos' },
];
 
export default function Financial() {
  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: allTenants = [] } = useTenants();
  const { data: financialRecords = [], isLoading } = useAllFinancialRecords();
  const { data: contracts = [] } = useContracts();
  const { data: allDebtAgreements = [] } = useAllDebtAgreements();
  const { data: allDebtInstallments = [] } = useAllDebtInstallments();
  const upsert = useUpsertFinancialRecord();
 
  // Filtros ficam na URL: voltar de um apartamento mantém a visão, e dá pra compartilhar o link
  const [searchParams, setSearchParams] = useSearchParams();
  const filterYear = searchParams.get('ano') ?? '2026';
  const filterMonth = searchParams.get('mes') ?? 'all';
  const filterCondo = searchParams.get('condo') ?? 'all';
  const filterStatus = searchParams.get('status') ?? 'all';
  const defaults: Record<string, string> = { ano: '2026', mes: 'all', condo: 'all', status: 'all' };
  function setParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === defaults[key]) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }
  const kpi = (v: React.ReactNode) => (isLoading ? <Skeleton className="h-7 w-24" /> : v);
  const [undoRecord, setUndoRecord] = useState<FinancialRecordDB | null>(null);
  const [receiptRecord, setReceiptRecord] = useState<FinancialRecordDB | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
 
  // Modal de pagamento
  const [paymentModal, setPaymentModal] = useState<{
    record: FinancialRecordDB;
    date: string;
    paidAmount: string;
    method: PaymentMethod;
  } | null>(null);
 
  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }
 
  const enriched = financialRecords.map(r => {
    const apt = apartments.find(a => a.id === r.apartment_id);
    const condo = apt ? condominiums.find(c => c.id === apt.condominium_id) : null;
    const tenant = allTenants.find(t => t.id === r.tenant_id);
    const contract = contracts.find(c => c.id === r.contract_id);
    const status = computeRecordStatus(r.paid, r.month, contract?.payment_day, contract?.start_date, contract?.desired_payment_day, contract?.desired_payment_date);
    const dueDate = getRecordDueDate(r.month, contract?.start_date, contract?.payment_day, contract?.desired_payment_day, contract?.desired_payment_date);
    return { ...r, apt, condo, tenant, contract, computedStatus: status, dueDate };
  });
 
  let filtered = enriched.filter(r => {
    if (r.month < '2026-01') return false;
    // Registros nao pagos de contratos encerrados nao devem aparecer
    if (!r.paid && r.contract?.status === 'ended') return false;
    if (filterCondo !== 'all' && r.condo?.id !== filterCondo) return false;
 
    let dateForFilter: string;
    if (r.paid && r.payment_date) {
      dateForFilter = r.payment_date;
    } else {
      dateForFilter = r.dueDate;
    }
 
    const [y, m] = dateForFilter.split('-').map(Number);
    if (y !== Number(filterYear)) return false;
    if (filterMonth !== 'all' && m - 1 !== Number(filterMonth)) return false;
 
    if (filterStatus !== 'all') {
      if (filterStatus === 'paid' && r.computedStatus !== 'paid') return false;
      if (filterStatus === 'pending' && r.computedStatus !== 'pending') return false;
      if (filterStatus === 'overdue' && r.computedStatus !== 'overdue') return false;
    }
    return true;
  });
 
  if (sortField) {
    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'condo': cmp = (a.condo?.name ?? '').localeCompare(b.condo?.name ?? ''); break;
        case 'apt': cmp = (a.apt?.unit_number ?? '').localeCompare(b.apt?.unit_number ?? '', undefined, { numeric: true }); break;
        case 'tenant': {
          const na = a.tenant ? `${a.tenant.first_name} ${a.tenant.last_name}` : '';
          const nb = b.tenant ? `${b.tenant.first_name} ${b.tenant.last_name}` : '';
          cmp = na.localeCompare(nb); break;
        }
        case 'period': cmp = a.month.localeCompare(b.month); break;
        case 'status': cmp = a.computedStatus.localeCompare(b.computedStatus); break;
        case 'payment_date': cmp = (a.payment_date ?? '').localeCompare(b.payment_date ?? ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    filtered.sort((a, b) => a.month.localeCompare(b.month));
  }
 
  // Totais usando calcReceived (valor real recebido)
  const totalReceived = filtered
    .filter(r => r.computedStatus === 'paid')
    .reduce((s, r) => s + calcReceived(r), 0);
  const totalToReceive = filtered
    .filter(r => r.computedStatus === 'pending')
    .reduce((s, r) => s + r.rent_value, 0);
  const totalOverdue = filtered
    .filter(r => r.computedStatus === 'overdue')
    .reduce((s, r) => s + r.rent_value, 0);
  const totalOwed = filtered
    .filter(r => r.paid)
    .reduce((s, r) => s + calcOwed(r), 0);

  // Saldo de parcelas não pagas de acordos ativos também entra em Devendo
  const agreementsOwedFinancial = allDebtAgreements
    .filter(ag => ag.status === 'active')
    .reduce((s, ag) => {
      const unpaid = allDebtInstallments
        .filter(i => i.agreement_id === ag.id && !i.paid)
        .reduce((sum, i) => sum + i.amount, 0);
      return s + unpaid;
    }, 0);
  const totalOwedAll = totalOwed + agreementsOwedFinancial;
 
  function openPaymentModal(record: FinancialRecordDB) {
    setPaymentModal({
      record,
      date: new Date().toISOString().split('T')[0],
      paidAmount: String(record.rent_value),
      method: 'pix',
    });
  }
 
  async function confirmPayment() {
    if (!paymentModal) return;
    const paidAmt = parseFloat(paymentModal.paidAmount) || 0;
    await upsert.mutateAsync({
      ...paymentModal.record,
      paid: true,
      payment_date: paymentModal.date || new Date().toISOString().split('T')[0],
      paid_amount: paidAmt,
      payment_method: paymentModal.method,
      status: 'Pago',
    });
    setPaymentModal(null);
  }
 
  async function unmarkPaid(record: FinancialRecordDB) {
    await upsert.mutateAsync({
      ...record,
      paid: false,
      payment_date: null,
      paid_amount: null,
      payment_method: null,
      debt_paid_amount: null,
      debt_payment_date: null,
      debt_payment_method: null,
      status: 'Pendente',
    });
  }
 
  const receiptApt = receiptRecord ? apartments.find(a => a.id === receiptRecord.apartment_id) : null;
  const receiptTenant = receiptRecord ? allTenants.find(t => t.id === receiptRecord.tenant_id) : null;
  const receiptContract = receiptRecord ? contracts.find(c => c.id === receiptRecord.contract_id) : null;
  const receiptCondo = receiptApt ? condominiums.find(c => c.id === receiptApt.condominium_id) : null;
 
  function SortHeader({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort(field)}>
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </button>
    );
  }
 
  return (
    <Layout>
      <div className="page-content">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Painel de controle de recebimentos</p>
        </div>
 
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
          <KpiCard label="Recebido" tone="paid" icon={TrendingUp} value={kpi(formatCurrency(totalReceived))} hint="Valor efetivamente recebido" />
          <KpiCard label="A Receber" tone="warning" icon={DollarSign} value={kpi(formatCurrency(totalToReceive))} hint="Vencimento não chegou" />
          <KpiCard label="Inadimplente" tone="overdue" icon={TrendingDown} value={kpi(formatCurrency(totalOverdue))} hint="Venceu e não pagou" />
          <KpiCard
            label="Devendo"
            tone={totalOwedAll > 0 ? 'overdue' : 'paid'}
            icon={AlertTriangle}
            value={kpi(formatCurrency(totalOwedAll))}
            hint={
              <>
                {agreementsOwedFinancial > 0 && (
                  <p className="flex items-center gap-1"><Handshake className="w-3 h-3" />Acordos: {formatCurrency(agreementsOwedFinancial)}</p>
                )}
                <p>Saldo devedor dos pagos</p>
              </>
            }
          />
        </div>

        {/* Filtros */}
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Filtrar por status">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setParam('status', f.value)}
                aria-pressed={filterStatus === f.value}
                className={`shrink-0 h-10 md:h-9 px-4 rounded-full border text-sm font-medium transition-colors ${
                  filterStatus === f.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <Select value={filterYear} onValueChange={v => setParam('ano', v)}>
              <SelectTrigger className="w-full sm:w-24 h-10 md:h-9 text-sm" aria-label="Ano"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={v => setParam('mes', v)}>
              <SelectTrigger className="w-full sm:w-40 h-10 md:h-9 text-sm" aria-label="Mês"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCondo} onValueChange={v => setParam('condo', v)}>
              <SelectTrigger className="w-full col-span-2 sm:col-span-1 sm:w-48 h-10 md:h-9 text-sm" aria-label="Condomínio"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos condomínios</SelectItem>
                {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="space-y-2" role="status" aria-label="Carregando registros">
            {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="text-muted-foreground">Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="md:hidden space-y-2">
              {filtered.map(r => {
                const { periodLabel, dueDateLabel } = getPeriodAndDueDate(r.month, r.contract?.start_date ?? null, r.contract?.payment_day ?? 1, r.contract?.desired_payment_day, r.contract?.desired_payment_date);
                const owed = calcOwed(r);
                const tenantName = r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : '—';
                return (
                  <li key={r.id} className="bg-card rounded-xl border border-border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{tenantName}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.condo?.name ?? '—'} · {r.apt?.unit_number ?? '—'}</p>
                      </div>
                      <StatusBadge status={r.computedStatus} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {periodLabel} · vence {dueDateLabel}
                      {r.paid && r.payment_date ? ` · pago em ${r.payment_date}` : ''}
                    </p>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <p className="text-lg font-bold">{formatCurrency(r.paid ? calcReceived(r) : r.rent_value)}</p>
                        {owed > 0 && <p className="text-xs font-semibold text-overdue">Devendo {formatCurrency(owed)}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r.paid ? (
                          <button onClick={() => setUndoRecord(r)} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-destructive" aria-label="Desfazer pagamento">
                            <XCircle className="w-5 h-5" />
                          </button>
                        ) : (
                          <Button size="sm" className="h-10 px-4" onClick={() => openPaymentModal(r)}>
                            <Banknote className="w-4 h-4 mr-1.5" />Receber
                          </Button>
                        )}
                        <button onClick={() => setReceiptRecord(r)} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-primary" aria-label="Gerar recibo PDF">
                          <Receipt className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card" style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide"><SortHeader field="condo">Condomínio</SortHeader></th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide"><SortHeader field="apt">Apto</SortHeader></th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide"><SortHeader field="tenant">Inquilino</SortHeader></th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell"><SortHeader field="period">Período Ref.</SortHeader></th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Vencimento</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Pago</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden xl:table-cell">Forma</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide"><SortHeader field="status">Status</SortHeader></th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide"><SortHeader field="payment_date">Data Pag.</SortHeader></th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-overdue">Devendo</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const { periodLabel, dueDateLabel } = getPeriodAndDueDate(r.month, r.contract?.start_date ?? null, r.contract?.payment_day ?? 1, r.contract?.desired_payment_day, r.contract?.desired_payment_date);
                    const owed = calcOwed(r);
                    const received = calcReceived(r);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3">{r.condo?.name ?? '—'}</td>
                        <td className="px-3 py-3 font-medium">{r.apt?.unit_number ?? '—'}</td>
                        <td className="px-3 py-3">{r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : '—'}</td>
                        <td className="px-3 py-3 text-xs hidden lg:table-cell">{periodLabel}</td>
                        <td className="px-3 py-3 text-center text-xs hidden lg:table-cell">{dueDateLabel}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatCurrency(r.rent_value)}</td>
                        <td className="px-3 py-3 text-right">
                          {r.paid ? <span className="text-paid">{formatCurrency(received)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-muted-foreground hidden xl:table-cell">
                          {r.payment_method === 'pix'
                            ? <span className="inline-flex items-center gap-1"><Banknote className="w-3 h-3" />Pix</span>
                            : r.payment_method === 'especie'
                            ? <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" />Espécie</span>
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-center"><StatusBadge status={r.computedStatus} /></td>
                        <td className="px-3 py-3 text-center text-xs text-muted-foreground">{r.payment_date ?? '—'}</td>
                        <td className="px-3 py-3 text-right text-xs">
                          {owed > 0 ? <span className="font-semibold text-overdue">{formatCurrency(owed)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {r.paid ? (
                              <button onClick={() => setUndoRecord(r)} className="p-2 rounded-md hover:bg-muted transition-colors" title="Desfazer pagamento" aria-label="Desfazer pagamento">
                                <XCircle className="w-4 h-4 text-destructive" />
                              </button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 px-3 text-primary border-primary/40" onClick={() => openPaymentModal(r)}>
                                Receber
                              </Button>
                            )}
                            <button onClick={() => setReceiptRecord(r)} className="p-2 rounded-md hover:bg-muted transition-colors text-primary" title="Gerar recibo PDF" aria-label="Gerar recibo PDF">
                              <Receipt className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal de Recibo */}
      {receiptRecord && receiptApt && receiptTenant && (
        <ReceiptModalDB
          open={!!receiptRecord}
          onClose={() => setReceiptRecord(null)}
          record={receiptRecord}
          apartment={receiptApt}
          tenant={receiptTenant}
          contract={receiptContract ?? null}
          allRecords={financialRecords.filter(r => r.apartment_id === receiptRecord.apartment_id && r.tenant_id === receiptRecord.tenant_id)}
          condominiumName={receiptCondo?.name ?? ''}
        />
      )}
 
      {/* ─── Modal de Pagamento ──────────────────────────────────────────────────── */}
      <Dialog open={!!paymentModal} onOpenChange={() => setPaymentModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Registrar Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {paymentModal && (
              <p className="text-xs text-muted-foreground">
                {apartments.find(a => a.id === paymentModal.record.apartment_id)?.unit_number ?? ''} · Contrato: <strong>{formatCurrency(paymentModal.record.rent_value)}</strong>
              </p>
            )}
 
            {/* Valor pago */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Valor Pago (R$)</Label>
                {paymentModal && (
                  <button type="button" className="text-xs font-semibold text-primary hover:underline py-1"
                    onClick={() => setPaymentModal(prev => prev ? { ...prev, paidAmount: String(prev.record.rent_value) } : null)}>
                    Valor integral
                  </button>
                )}
              </div>
              <Input
                type="number" inputMode="decimal" min="0" step="0.01" className="mt-1"
                value={paymentModal?.paidAmount ?? ''}
                onChange={e => setPaymentModal(prev => prev ? { ...prev, paidAmount: e.target.value } : null)}
                autoFocus
              />
              {paymentModal && parseFloat(paymentModal.paidAmount) < paymentModal.record.rent_value && parseFloat(paymentModal.paidAmount) > 0 && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'hsl(var(--overdue))' }}>
                  <AlertTriangle className="w-3 h-3" />
                  Ficará devendo {formatCurrency(paymentModal.record.rent_value - parseFloat(paymentModal.paidAmount))}
                </p>
              )}
            </div>
 
            {/* Forma de pagamento */}
            <div>
              <Label>Forma de Pagamento</Label>
              <div className="flex gap-2 mt-1">
                {(['pix', 'especie'] as PaymentMethod[]).map(m => (
                  <button key={m}
                    onClick={() => setPaymentModal(prev => prev ? { ...prev, method: m } : null)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors ${
                      paymentModal?.method === m
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {m === 'pix' ? <Banknote className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                    {m === 'pix' ? 'Pix' : 'Espécie'}
                  </button>
                ))}
              </div>
            </div>
 
            {/* Data */}
            <div>
              <Label>Data do Pagamento</Label>
              <Input type="date" className="mt-1"
                value={paymentModal?.date ?? ''}
                onChange={e => setPaymentModal(prev => prev ? { ...prev, date: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentModal(null)}>Cancelar</Button>
            <Button onClick={confirmPayment} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!undoRecord} onOpenChange={o => !o && setUndoRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer este pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro volta para "A Receber" e os dados do pagamento (valor, data e forma) são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (undoRecord) await unmarkPaid(undoRecord); setUndoRecord(null); }}>
              Desfazer pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
