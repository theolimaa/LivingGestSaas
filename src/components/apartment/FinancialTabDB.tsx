import { useState } from 'react';
import {
  CheckCircle, XCircle, AlertCircle, Receipt, Loader2,
  CalendarDays, Banknote, Wallet, AlertTriangle,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApp } from '@/lib/store';
import { formatCurrency, MONTHS, YEARS, getPeriodAndDueDate, getRecordStatus } from '@/lib/utils-app';
import {
  useFinancialRecords, useUpsertFinancialRecord, FinancialRecordDB,
  calcOwed, calcReceived,
} from '@/hooks/useFinancial';
import { useContract } from '@/hooks/useContracts';
import { useTenants } from '@/hooks/useTenants';
import { useApartment } from '@/hooks/useApartments';
import { useCondominiums } from '@/hooks/useCondominiums';
import ReceiptModalDB from './ReceiptModalDB';

type PaymentMethod = 'pix' | 'especie';

function MethodLabel({ method }: { method: string | null }) {
  if (!method) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {method === 'pix'
        ? <><Banknote className="w-3 h-3" /> Pix</>
        : <><Wallet className="w-3 h-3" /> Espécie</>}
    </span>
  );
}

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

export default function FinancialTabDB({ apartmentId, tenantId, tenantName, tenantCpf }: {
  apartmentId: string; tenantId: string; tenantName: string; tenantCpf: string;
}) {
  const { state } = useApp();
  const { data: records = [], isLoading } = useFinancialRecords(apartmentId);
  const { data: contract } = useContract(tenantId);
  const { data: apartment } = useApartment(apartmentId);
  const { data: condominiums = [] } = useCondominiums();
  const condominiumName = apartment
    ? (condominiums.find(c => c.id === apartment.condominium_id)?.name ?? '')
    : '';
  const { data: tenants = [] } = useTenants(apartmentId);
  const upsert = useUpsertFinancialRecord();

  const [filterYear, setFilterYear] = useState(String(state.selectedYear));
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [receiptRecord, setReceiptRecord] = useState<FinancialRecordDB | null>(null);

  // Modal de registro de pagamento
  const [paymentModal, setPaymentModal] = useState<{
    record: FinancialRecordDB;
    date: string;
    paidAmount: string;
    method: PaymentMethod;
    isDebt: boolean;        // true = fica devendo a diferença
    observations: string;   // acordo ou observação livre
  } | null>(null);

  // Modal de registro de dívida (pagamento posterior do saldo)
  const [debtModal, setDebtModal] = useState<{
    record: FinancialRecordDB;
    date: string;
    amount: string;
    method: PaymentMethod;
  } | null>(null);

  const paymentDay = contract?.payment_day ?? 1;
  const contractStartDate = contract?.start_date ?? null;
  const desiredPaymentDay = contract?.desired_payment_day ?? null;
  const desiredPaymentDate = contract?.desired_payment_date ?? null;

  const contractStartMonth = contractStartDate ? contractStartDate.substring(0, 7) : null;
  const tenantRecords = records.filter(r =>
    r.tenant_id === tenantId &&
    (!contractStartMonth || r.month >= contractStartMonth)
  );
  const currentTenant = tenants.find(t => t.id === tenantId);

  const filteredRecords = tenantRecords.filter(r => {
    if (r.month.includes('_') || r.month.length > 7) return false;
    const [y, m] = r.month.split('-').map(Number);
    return y === Number(filterYear) && (filterMonth === 'all' || m - 1 === Number(filterMonth));
  }).sort((a, b) => a.month.localeCompare(b.month));

  const seen = new Map<string, FinancialRecordDB>();
  for (const r of filteredRecords) {
    const existing = seen.get(r.month);
    if (!existing || r.paid) seen.set(r.month, r);
  }
  const dedupedRecords = Array.from(seen.values()).sort((a, b) => a.month.localeCompare(b.month));

  // Totais usando calcReceived (respeita paid_amount parcial)
  const totalPaid = dedupedRecords.reduce((s, r) => s + calcReceived(r), 0);
  const totalOwed = dedupedRecords.filter(r => r.paid).reduce((s, r) => s + calcOwed(r), 0);
  const totalOverdue = dedupedRecords
    .filter(r => getStatus(r, paymentDay, contractStartDate, desiredPaymentDay, desiredPaymentDate) === 'overdue')
    .reduce((s, r) => s + r.rent_value, 0);
  const totalPending = dedupedRecords
    .filter(r => !r.paid && getStatus(r, paymentDay, contractStartDate, desiredPaymentDay, desiredPaymentDate) === 'pending')
    .reduce((s, r) => s + r.rent_value, 0);

  // Abrir modal de pagamento
  function openPaymentModal(record: FinancialRecordDB) {
    setPaymentModal({
      record,
      date: new Date().toISOString().split('T')[0],
      paidAmount: String(record.rent_value),
      method: 'pix',
      isDebt: true,
      observations: record.observations ?? '',
    });
  }

  // Confirmar pagamento
  async function confirmPayment() {
    if (!paymentModal) return;
    const paidAmt = parseFloat(paymentModal.paidAmount) || 0;
    const isPartial = paidAmt < paymentModal.record.rent_value && paidAmt > 0;
    // Acordo (sem dívida): salva paid_amount = valor real (423) e marca
    // debt_payment_method = 'acordo' para que calcOwed retorne 0.
    // Assim os totais refletem o valor real recebido, sem mostrar dívida.
    const isAcordo = isPartial && !paymentModal.isDebt;
    let obs = paymentModal.observations.trim();
    if (isAcordo) {
      const discountNote = `Acordo: ${formatCurrency(paidAmt)} aceito como quitação (desconto de ${formatCurrency(paymentModal.record.rent_value - paidAmt)}).`;
      obs = obs ? `${obs} — ${discountNote}` : discountNote;
    }
    await upsert.mutateAsync({
      ...paymentModal.record,
      paid: true,
      payment_date: paymentModal.date || new Date().toISOString().split('T')[0],
      paid_amount: paidAmt,                                    // sempre o valor real pago
      payment_method: paymentModal.method,
      debt_payment_method: isAcordo ? 'acordo' : (paymentModal.record.debt_payment_method ?? null),
      observations: obs || null,
      status: 'Pago',
    });
    setPaymentModal(null);
  }

  // Desmarcar pagamento
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

  // Confirmar pagamento de dívida
  async function confirmDebtPayment() {
    if (!debtModal) return;
    const amt = parseFloat(debtModal.amount) || 0;
    await upsert.mutateAsync({
      ...debtModal.record,
      debt_paid_amount: amt,
      debt_payment_date: debtModal.date || new Date().toISOString().split('T')[0],
      debt_payment_method: debtModal.method,
    });
    setDebtModal(null);
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-2">
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Pago</p>
          <p className="font-bold" style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">A Receber</p>
          <p className="font-bold" style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Inadimplente</p>
          <p className="font-bold" style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(totalOverdue)}</p>
        </div>
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Devendo</p>
          <p className="font-bold" style={{ color: totalOwed > 0 ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }}>
            {formatCurrency(totalOwed)}
          </p>
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : dedupedRecords.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p>Nenhum período encontrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Período</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Vencimento</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Valor</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground hidden sm:table-cell">Pago</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Forma</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground hidden sm:table-cell">Data Pag.</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-3 py-3 font-medium hidden sm:table-cell" style={{ color: 'hsl(var(--overdue))' }}>Devendo</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dedupedRecords.map(r => {
                const st = getStatus(r, paymentDay, contractStartDate, desiredPaymentDay, desiredPaymentDate);
                const { periodLabel, dueDateLabel } = getPeriodAndDueDate(r.month, contractStartDate, paymentDay, desiredPaymentDay, desiredPaymentDate);
                const owed = calcOwed(r);
                const received = calcReceived(r);

                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-medium text-xs">{periodLabel}</td>
                    <td className="px-3 py-3 text-center text-xs hidden md:table-cell">{dueDateLabel}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatCurrency(r.rent_value)}</td>
                    <td className="px-3 py-3 text-right hidden sm:table-cell">
                      {r.paid ? (
                        <span style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(received)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <MethodLabel method={r.payment_method} />
                    </td>
                    <td className="px-3 py-3 text-center text-muted-foreground text-xs hidden sm:table-cell">
                      {r.payment_date ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {st === 'paid' && <span className="badge-paid"><CheckCircle className="w-3 h-3" /> Pago</span>}
                      {st === 'pending' && <span className="badge-unpaid">A vencer</span>}
                      {st === 'overdue' && <span className="badge-overdue"><AlertCircle className="w-3 h-3" /> Inadimplente</span>}
                    </td>
                    <td className="px-3 py-3 text-right hidden sm:table-cell">
                      {owed > 0 ? (
                        <button
                          onClick={() => setDebtModal({
                            record: r,
                            date: new Date().toISOString().split('T')[0],
                            amount: String(owed),
                            method: 'pix',
                          })}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: 'hsl(var(--overdue))' }}
                          title="Registrar pagamento do saldo"
                        >
                          {formatCurrency(owed)}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => r.paid ? unmarkPaid(r) : openPaymentModal(r)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                          title={r.paid ? 'Desmarcar pagamento' : 'Registrar pagamento'}
                        >
                          {r.paid
                            ? <XCircle className="w-4 h-4 text-destructive" />
                            : <CheckCircle className="w-4 h-4" style={{ color: 'hsl(var(--paid))' }} />}
                        </button>
                        <button
                          onClick={() => setReceiptRecord(r)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title="Gerar recibo PDF"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
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
      )}

      {/* Modal de Recibo */}
      {receiptRecord && apartment && currentTenant && (
        <ReceiptModalDB
          open={!!receiptRecord}
          onClose={() => setReceiptRecord(null)}
          record={receiptRecord}
          apartment={apartment}
          tenant={currentTenant}
          contract={contract ?? null}
          allRecords={tenantRecords}
          condominiumName={condominiumName}
        />
      )}

      {/* ─── Modal de Pagamento ──────────────────────────────────────────────── */}
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
                Contrato: <strong>{formatCurrency(paymentModal.record.rent_value)}</strong>
              </p>
            )}

            {/* Valor pago */}
            <div>
              <Label>Valor Pago (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="mt-1"
                value={paymentModal?.paidAmount ?? ''}
                onChange={e => setPaymentModal(prev => prev ? { ...prev, paidAmount: e.target.value } : null)}
              />
              {/* Aviso + toggle de dívida quando pagamento é parcial */}
              {paymentModal && parseFloat(paymentModal.paidAmount) < paymentModal.record.rent_value && parseFloat(paymentModal.paidAmount) > 0 && (
                <div className="mt-2 space-y-2">
                  <div
                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                    style={{
                      background: paymentModal.isDebt ? 'hsl(var(--overdue) / 0.06)' : 'hsl(var(--paid) / 0.06)',
                      borderColor: paymentModal.isDebt ? 'hsl(var(--overdue) / 0.3)' : 'hsl(var(--paid) / 0.3)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: paymentModal.isDebt ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }} />
                      <span className="text-xs font-medium" style={{ color: paymentModal.isDebt ? 'hsl(var(--overdue))' : 'hsl(var(--paid))' }}>
                        {paymentModal.isDebt
                          ? `Ficará devendo ${formatCurrency(paymentModal.record.rent_value - parseFloat(paymentModal.paidAmount))}`
                          : `Acordo: quitado por ${formatCurrency(parseFloat(paymentModal.paidAmount))}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentModal(prev => prev ? { ...prev, isDebt: !prev.isDebt } : null)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${paymentModal.isDebt ? 'bg-destructive' : 'bg-green-500'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${paymentModal.isDebt ? 'translate-x-1' : 'translate-x-4'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    {paymentModal.isDebt ? 'Desative para registrar como acordo (sem dívida).' : 'Ative para registrar a diferença como dívida.'}
                  </p>
                </div>
              )}
            </div>

            {/* Forma de pagamento */}
            <div>
              <Label>Forma de Pagamento</Label>
              <div className="flex gap-2 mt-1">
                {(['pix', 'especie'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentModal(prev => prev ? { ...prev, method: m } : null)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm transition-colors ${
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

            {/* Data do pagamento */}
            <div>
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                className="mt-1"
                value={paymentModal?.date ?? ''}
                onChange={e => setPaymentModal(prev => prev ? { ...prev, date: e.target.value } : null)}
              />
            </div>

            {/* Observação */}
            <div>
              <Label>Observação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                className="mt-1"
                maxLength={120}
                placeholder="Ex: desconto combinado, pagamento antecipado..."
                value={paymentModal?.observations ?? ''}
                onChange={e => setPaymentModal(prev => prev ? { ...prev, observations: e.target.value } : null)}
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

      {/* ─── Modal de Saldo Devedor ──────────────────────────────────────────── */}
      <Dialog open={!!debtModal} onOpenChange={() => setDebtModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" style={{ color: 'hsl(var(--overdue))' }} />
              Registrar Pagamento de Saldo
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {debtModal && (
              <p className="text-xs text-muted-foreground">
                Saldo devedor original: <strong style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(calcOwed(debtModal.record))}</strong>
              </p>
            )}

            <div>
              <Label>Valor Pago (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="mt-1"
                value={debtModal?.amount ?? ''}
                onChange={e => setDebtModal(prev => prev ? { ...prev, amount: e.target.value } : null)}
              />
            </div>

            <div>
              <Label>Forma de Pagamento</Label>
              <div className="flex gap-2 mt-1">
                {(['pix', 'especie'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setDebtModal(prev => prev ? { ...prev, method: m } : null)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm transition-colors ${
                      debtModal?.method === m
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

            <div>
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                className="mt-1"
                value={debtModal?.date ?? ''}
                onChange={e => setDebtModal(prev => prev ? { ...prev, date: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebtModal(null)}>Cancelar</Button>
            <Button onClick={confirmDebtPayment} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
