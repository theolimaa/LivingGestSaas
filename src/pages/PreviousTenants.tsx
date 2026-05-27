import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, History, Building2, Home, AlertCircle,
  CheckCircle2, ChevronDown, ChevronRight, Loader2,
  Pencil, FileText, Download, Handshake,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAllPreviousTenants } from '@/hooks/useTenants';
import { buildReceiptPDF } from '@/lib/generateReceiptPDF';
import { DebtAgreementPanel } from '@/components/DebtAgreementPanel';
import { useAllDebtAgreements } from '@/hooks/useDebtAgreements';
import { useAuth } from '@/hooks/useAuth';
import { useApartments } from '@/hooks/useApartments';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useContracts, useUpsertContract } from '@/hooks/useContracts';
import { useAllFinancialRecords, useUpsertFinancialRecord, calcOwed, calcReceived, FinancialRecordDB } from '@/hooks/useFinancial';
import { formatCurrency, formatDate, getPeriodAndDueDate } from '@/lib/utils-app';
import { toast } from 'sonner';

type PaymentMethod = 'pix' | 'especie';

function Badge({ children, color }: { children: React.ReactNode; color: 'red' | 'green' | 'gray' }) {
  const styles = {
    red: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    gray: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

export default function PreviousTenants() {
  const { data: previousTenants = [], isLoading: loadingTenants } = useAllPreviousTenants();
  const { data: apartments = [] } = useApartments();
  const { data: condominiums = [] } = useCondominiums();
  const { data: contracts = [] } = useContracts();
  const { data: financialRecords = [] } = useAllFinancialRecords();
  const upsert = useUpsertFinancialRecord();
  const upsertContract = useUpsertContract();
  const { data: allAgreements = [] } = useAllDebtAgreements();
  const { user } = useAuth();

  // Modal edição de contrato
  const [editContractModal, setEditContractModal] = useState<{
    pt: typeof enriched[0];
    endDate: string;
    rentValue: string;
  } | null>(null);

  async function handleSaveContract() {
    if (!editContractModal?.pt.contract) return;
    const c = editContractModal.pt.contract;
    await upsertContract.mutateAsync({
      id: c.id,
      tenant_id: c.tenant_id,
      start_date: c.start_date,
      end_date: editContractModal.endDate || null,
      payment_day: c.payment_day,
      desired_payment_day: c.desired_payment_day,
      desired_payment_date: c.desired_payment_date,
      rent_value: parseFloat(editContractModal.rentValue) || c.rent_value,
      observations: c.observations,
      status: c.status,
      caution_paid: c.caution_paid ?? null,
      caution_value: c.caution_value ?? null,
      caution_date: c.caution_date ?? null,
    });
    setEditContractModal(null);
    toast.success('Contrato atualizado!');
  }
  const adminName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';

  const [search, setSearch] = useState('');
  const [filterCondo, setFilterCondo] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modal de edição de pagamento
  const [editModal, setEditModal] = useState<{
    record: FinancialRecordDB;
    paidAmount: string;
    date: string;
    method: PaymentMethod;
    debtAmount: string;
  } | null>(null);

  // Enriquecer anteriores
  const enriched = useMemo(() => {
    return previousTenants.map(pt => {
      const apt = apartments.find(a => a.id === pt.apartment_id);
      const condo = condominiums.find(c => c.id === apt?.condominium_id);
      // Busca contrato pelo original_id (tenants.id)
      const contract = contracts.find(c => c.tenant_id === pt.original_id);
      // Registros financeiros vinculados ao tenant original
      const records = financialRecords.filter(r => r.tenant_id === pt.original_id);
      const hasActiveAgreement = allAgreements.some(a => a.previous_tenant_id === pt.id && a.status === 'active');
      // Dívida quitada ou cancelada via acordo = R$0 (perdoada ou encerrada)
      const hasSettledAgreement = allAgreements.some(a => a.previous_tenant_id === pt.id && (a.status === 'settled' || a.status === 'cancelled'));
      const hasAnyAgreement = allAgreements.some(a => a.previous_tenant_id === pt.id);
      // Ex-inquilino: registros não pagos = dívida total; pagos parciais = saldo devedor
      // Se há acordo quitado/cancelado = dívida considerada zerada
      const totalOwed = (hasActiveAgreement || hasSettledAgreement)
        ? records.reduce((s, r) => s + calcOwed(r), 0) // só conta saldos de pagamentos parciais
        : records.reduce((s, r) => !r.paid ? s + r.rent_value : s + calcOwed(r), 0);
      const totalReceived = records.reduce((s, r) => s + calcReceived(r), 0);
      return { ...pt, apt, condo, contract, records, totalOwed, totalReceived, hasActiveAgreement, hasAnyAgreement };
    });
  }, [previousTenants, apartments, condominiums, contracts, financialRecords, allAgreements]);

  // Filtros
  const filtered = enriched.filter(pt => {
    const name = `${pt.first_name} ${pt.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !pt.apt?.unit_number.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCondo !== 'all' && pt.condo?.id !== filterCondo) return false;
    return true;
  });

  const totalDebtAll = filtered.reduce((s, pt) => s + pt.totalOwed, 0);
  const withDebt = filtered.filter(pt => pt.totalOwed > 0);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    const paidAmt = parseFloat(editModal.paidAmount);
    const debtAmt = parseFloat(editModal.debtAmount);
    if (isNaN(paidAmt)) { toast.error('Valor inválido.'); return; }

    // Se debtAmount foi preenchido explicitamente, ajusta paid_amount para rent_value - debt
    const effectivePaid = !isNaN(debtAmt)
      ? Math.max(0, editModal.record.rent_value - debtAmt)
      : paidAmt;

    await upsert.mutateAsync({
      ...editModal.record,
      paid: true,
      paid_amount: effectivePaid,
      payment_date: editModal.date,
      payment_method: editModal.method,
    });
    setEditModal(null);
    toast.success('Pagamento atualizado!');
  }

  async function handleDownloadReceipt(r: FinancialRecordDB, pt: typeof enriched[0]) {
    try {
      const allAptRecords = pt.records;
      const isDebtNotice = !r.paid;
      const totalOwed = pt.totalOwed;
      const pdfBytes = buildReceiptPDF({
        record: r,
        apartmentUnit: pt.apt?.unit_number ?? '',
        condominiumName: pt.condo?.name ?? '',
        tenantFirstName: pt.first_name,
        tenantLastName: pt.last_name,
        tenantCpf: pt.cpf,
        contractPaymentDay: pt.contract?.payment_day,
        contractStartDate: pt.contract?.start_date,
        contractCautionPaid: pt.contract?.caution_paid,
        contractCautionValue: pt.contract?.caution_value,
        contractCautionDate: pt.contract?.caution_date,
        allYearRecords: allAptRecords,
        adminName,
        debtNotice: isDebtNotice,
        totalOwed: isDebtNotice ? totalOwed : undefined,
        contractEndDate: pt.contract?.end_date ?? null,
      });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const prefix = isDebtNotice ? 'Aviso' : 'Recibo';
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `${prefix}_${pt.apt?.unit_number ?? 'Apto'}_${pt.first_name}_${pt.last_name}_${r.month}.pdf`.replace(/\s+/g, '_'),
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(isDebtNotice ? 'Aviso de cobrança gerado!' : 'Recibo gerado!');
    } catch (err: any) {
      toast.error(`Erro ao gerar: ${err.message}`);
    }
  }

  return (
    <Layout>
      <div className="page-content">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-primary" />
            Inquilinos Anteriores
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gerencie pagamentos e débitos de inquilinos que já saíram.
          </p>
        </div>

        {/* Resumo de dívidas */}
        {totalDebtAll > 0 && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {withDebt.length} inquilino{withDebt.length !== 1 ? 's' : ''} com dívidas em aberto
              </p>
              <p className="text-xs text-red-600 dark:text-red-500">
                Total a receber: {formatCurrency(totalDebtAll)}
              </p>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou apartamento..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterCondo} onValueChange={setFilterCondo}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os condomínios</SelectItem>
              {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Lista */}
        {loadingTenants ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <History className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nenhum inquilino anterior encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(pt => {
              const isOpen = expanded.has(pt.id);
              const hasDebt = pt.totalOwed > 0 || pt.hasActiveAgreement;
              const contract = pt.contract;

              return (
                <div key={pt.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Cabeçalho do card */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleExpand(pt.id)}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold text-muted-foreground">
                      {pt.first_name.charAt(0)}{pt.last_name.charAt(0)}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">
                          {pt.first_name} {pt.last_name}
                        </p>
                        {hasDebt ? (
                          pt.hasActiveAgreement ? (
                            <Badge color="gray">
                              <Handshake className="w-3 h-3" />
                              Acordo em andamento
                            </Badge>
                          ) : (
                            <Badge color="red">
                              <AlertCircle className="w-3 h-3" />
                              Devendo {formatCurrency(pt.totalOwed)}
                            </Badge>
                          )
                        ) : (
                          <Badge color="green">
                            <CheckCircle2 className="w-3 h-3" />
                            Quitado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {pt.condo && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />{pt.condo.name}
                          </span>
                        )}
                        {pt.apt && (
                          <span className="flex items-center gap-1">
                            <Home className="w-3 h-3" />
                            <Link
                              to={`/apartments/${pt.apt.id}`}
                              onClick={e => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              Apto {pt.apt.unit_number}
                            </Link>
                          </span>
                        )}
                        {pt.archived_at && (
                          <span>Saiu em {formatDate(pt.archived_at.split('T')[0])}</span>
                        )}
                        {contract?.end_date && (
                          <span className="flex items-center gap-1">
                            Contrato até {formatDate(contract.end_date)}
                            <button
                              onClick={e => { e.stopPropagation(); setEditContractModal({ pt, endDate: contract.end_date ?? '', rentValue: String(contract.rent_value) }); }}
                              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                              title="Editar contrato"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Totais e chevron */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="hidden sm:block text-right">
                        <p className="text-xs text-muted-foreground">Recebido</p>
                        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--paid))' }}>
                          {formatCurrency(pt.totalReceived)}
                        </p>
                      </div>
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Histórico financeiro expandido */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/10">
                      {pt.records.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Nenhum registro financeiro encontrado.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Período</th>
                                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Valor</th>
                                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Pago</th>
                                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Devendo</th>
                                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Pagamento</th>
                                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pt.records
                                .sort((a, b) => a.month.localeCompare(b.month))
                                .map(r => {
                                  // Ex-inquilino: não pagos = dívida do período, pagos = saldo calcOwed
                                  const owed = r.paid ? calcOwed(r) : (pt.hasActiveAgreement ? 0 : r.rent_value);
                                  const received = calcReceived(r);
                                  const { periodLabel: basePeriodLabel } = getPeriodAndDueDate(
                                    r.month,
                                    contract?.start_date ?? null,
                                    contract?.payment_day ?? 1,
                                    contract?.desired_payment_day,
                                    contract?.desired_payment_date,
                                  );
                                  // Para o último período de contrato encerrado: substituir fim do período pela data real de saída
                                  let periodLabel = basePeriodLabel;
                                  // r.month é o mês de INÍCIO do período (ex: 2026-04 para 25/04→25/05)
                                  // O encerramento pode cair no mês SEGUINTE — precisamos comparar com o mês FIM do período
                                  if (contract?.end_date) {
                                    const [py, pm] = r.month.split('-').map(Number);
                                    const endM = pm === 12 ? 1 : pm + 1;
                                    const endY = pm === 12 ? py + 1 : py;
                                    const periodEndMonth = `${endY}-${String(endM).padStart(2,'0')}`;
                                    const contractEndMonth = contract.end_date.substring(0, 7);
                                    // Aplica se o contrato encerrou durante este período (início ou fim do mês do período)
                                    if (periodEndMonth === contractEndMonth || r.month === contractEndMonth) {
                                      const ed = new Date(contract.end_date + 'T12:00:00');
                                      const edStr = `${String(ed.getDate()).padStart(2,'0')}/${String(ed.getMonth()+1).padStart(2,'0')}/${ed.getFullYear()}`;
                                      const parts = basePeriodLabel.split(' a ');
                                      if (parts.length === 2) periodLabel = `${parts[0]} a ${edStr}`;
                                    }
                                  }
                                  return (
                                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                      <td className="px-4 py-2.5 text-xs font-medium">{periodLabel}</td>
                                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.rent_value)}</td>
                                      <td className="px-4 py-2.5 text-right">
                                        {r.paid
                                          ? <span style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(received)}</span>
                                          : <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        {owed > 0
                                          ? <span className="font-semibold text-destructive">{formatCurrency(owed)}</span>
                                          : <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                                        {r.payment_date ?? '—'}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => setEditModal({
                                              record: r,
                                              paidAmount: String(r.paid_amount ?? r.rent_value),
                                              date: r.payment_date ?? new Date().toISOString().split('T')[0],
                                              method: (r.payment_method as PaymentMethod) ?? 'pix',
                                              debtAmount: owed > 0 ? String(owed) : '',
                                            })}
                                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                            title="Editar pagamento"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                              onClick={() => handleDownloadReceipt(r, pt)}
                                              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                                              title={r.paid ? "Baixar recibo" : "Gerar aviso de cobrança"}
                                            >
                                              <FileText className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/30">
                                <td className="px-4 py-2 text-xs font-semibold text-muted-foreground">Total</td>
                                <td className="px-4 py-2 text-right font-bold text-sm">
                                  {formatCurrency(pt.records.reduce((s, r) => s + r.rent_value, 0))}
                                </td>
                                <td className="px-4 py-2 text-right font-bold text-sm" style={{ color: 'hsl(var(--paid))' }}>
                                  {formatCurrency(pt.totalReceived)}
                                </td>
                                <td className="px-4 py-2 text-right font-bold text-sm text-destructive">
                                  {pt.totalOwed > 0 ? formatCurrency(pt.totalOwed) : '—'}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Acordos de dívida — fora do isOpen para ter seu próprio controle */}
                  {isOpen && (pt.totalOwed > 0 || pt.hasAnyAgreement) && (
                    <div className="border-t border-border bg-muted/5 px-4 py-4">
                      <DebtAgreementPanel
                        previousTenantId={pt.id}
                        apartmentId={pt.apartment_id}
                        totalOwed={pt.totalOwed}
                        tenantFirstName={pt.first_name}
                        tenantLastName={pt.last_name}
                        tenantCpf={pt.cpf}
                        apartmentUnit={pt.apt?.unit_number ?? ''}
                        condominiumName={pt.condo?.name ?? ''}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal edição de contrato */}
      <Dialog open={!!editContractModal} onOpenChange={() => setEditContractModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Contrato
            </DialogTitle>
          </DialogHeader>
          {editContractModal && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                Inquilino: <strong>{editContractModal.pt.first_name} {editContractModal.pt.last_name}</strong>
                {' · '}Início: <strong>{formatDate(editContractModal.pt.contract?.start_date ?? '')}</strong>
              </div>
              <div>
                <Label>Data de encerramento</Label>
                <Input type="date" className="mt-1"
                  value={editContractModal.endDate}
                  onChange={e => setEditContractModal(p => p ? { ...p, endDate: e.target.value } : null)}
                />
              </div>
              <div>
                <Label>Valor do aluguel (R$)</Label>
                <Input type="number" step="0.01" className="mt-1"
                  value={editContractModal.rentValue}
                  onChange={e => setEditContractModal(p => p ? { ...p, rentValue: e.target.value } : null)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContractModal(null)}>Cancelar</Button>
            <Button onClick={handleSaveContract} disabled={upsertContract.isPending}>
              {upsertContract.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal edição de pagamento */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Pagamento
            </DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="py-2 space-y-4">
              <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                Contrato: <strong>{formatCurrency(editModal.record.rent_value)}</strong> ·
                Mês: <strong>{editModal.record.month}</strong>
              </div>
              <div>
                <Label>Valor Pago (R$)</Label>
                <Input type="number" min="0" step="0.01" className="mt-1"
                  value={editModal.paidAmount}
                  onChange={e => setEditModal(p => p ? { ...p, paidAmount: e.target.value, debtAmount: '' } : null)}
                />
              </div>
              <div>
                <Label>Valor Devendo <span className="text-muted-foreground font-normal">(ou deixe calcular automaticamente)</span></Label>
                <Input type="number" min="0" step="0.01" className="mt-1"
                  placeholder={String(Math.max(0, editModal.record.rent_value - parseFloat(editModal.paidAmount || '0')))}
                  value={editModal.debtAmount}
                  onChange={e => setEditModal(p => p ? { ...p, debtAmount: e.target.value } : null)}
                />
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                <div className="flex gap-2 mt-1">
                  {(['pix', 'especie'] as const).map(m => (
                    <button key={m} type="button"
                      onClick={() => setEditModal(p => p ? { ...p, method: m } : null)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${editModal.method === m ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      {m === 'pix' ? '📱 Pix' : '💵 Espécie'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Data do Pagamento</Label>
                <Input type="date" className="mt-1"
                  value={editModal.date}
                  onChange={e => setEditModal(p => p ? { ...p, date: e.target.value } : null)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
