import { useState } from 'react';
import {
  Handshake, Plus, ChevronDown, ChevronRight, CheckCircle2,
  XCircle, Clock, Loader2, Pencil, Trash2, RotateCcw, FileText,
} from 'lucide-react';
import { buildDebtAgreementReceiptPDF, DebtAgreementReceiptParams } from '@/lib/generateReceiptPDF';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils-app';
import {
  useDebtAgreements, useDebtInstallments,
  useCreateDebtAgreement, useUpdateDebtAgreement,
  usePayInstallment, useUnpayInstallment, useCancelDebtAgreement,
  useDeleteDebtAgreement,
  DebtAgreement,
} from '@/hooks/useDebtAgreements';

type PaymentMethod = 'pix' | 'especie';

function InstallmentRow({
  inst, agreement, previousTenantId, onReceiptClick,
}: {
  inst: ReturnType<typeof useDebtInstallments>['data'] extends (infer T)[] | undefined ? T : never;
  agreement: DebtAgreement;
  previousTenantId: string;
  onReceiptClick?: (installmentNumber: number) => void;
}) {
  const payInst = usePayInstallment();
  const unpayInst = useUnpayInstallment();
  const [showPayModal, setShowPayModal] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('pix');

  if (!inst) return null;

  async function handlePay() {
    // We need to know if this is the last unpaid installment
    setShowPayModal(false);
    await payInst.mutateAsync({
      installmentId: inst.id,
      agreementId: agreement.id,
      previousTenantId,
      paymentDate: payDate,
      paymentMethod: payMethod,
      allPaidAfterThis: false, // will be checked server-side via trigger or refetch
    });
  }

  return (
    <>
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-colors ${
        inst.paid ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-card border-border'
      }`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          inst.paid ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
        }`}>
          {inst.installment_number}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{formatCurrency(inst.amount)}</p>
          {inst.due_date && (
            <p className="text-xs text-muted-foreground">
              Venc: {formatDate(inst.due_date)}
              {inst.paid && inst.payment_date && ` · Pago: ${formatDate(inst.payment_date)}`}
              {inst.paid && inst.payment_method && ` via ${inst.payment_method === 'pix' ? 'Pix' : 'Espécie'}`}
            </p>
          )}
        </div>
        {inst.paid ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Pago</span>
            <button
              onClick={() => onReceiptClick?.(inst.installment_number)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
              title="Baixar recibo da parcela"
            >
              <FileText className="w-3 h-3" />
            </button>
            <button
              onClick={() => unpayInst.mutate({ installmentId: inst.id, agreementId: agreement.id, previousTenantId })}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
              title="Desfazer pagamento"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPayModal(true)}>
            Registrar
          </Button>
        )}
      </div>

      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Parcela {inst.installment_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
              Valor: <strong>{formatCurrency(inst.amount)}</strong>
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <div className="flex gap-2 mt-1">
                {(['pix', 'especie'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => setPayMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      payMethod === m ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                    }`}>
                    {m === 'pix' ? '📱 Pix' : '💵 Espécie'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Data do Pagamento</Label>
              <Input type="date" className="mt-1" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayModal(false)}>Cancelar</Button>
            <Button onClick={handlePay} disabled={payInst.isPending}>
              {payInst.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AgreementCard({
  agreement, previousTenantId, tenantFirstName, tenantLastName, tenantCpf, apartmentUnit, condominiumName,
}: {
  agreement: DebtAgreement;
  previousTenantId: string;
  tenantFirstName: string;
  tenantLastName: string;
  tenantCpf: string | null;
  apartmentUnit: string;
  condominiumName: string;
}) {
  const { data: installments = [] } = useDebtInstallments(agreement.id);
  const updateAgreement = useUpdateDebtAgreement();
  const cancelAgreement = useCancelDebtAgreement();
  const deleteAgreement = useDeleteDebtAgreement();
  const { user } = useAuth();
  const adminName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';
  const [expanded, setExpanded] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState(agreement.notes ?? '');
  const [editAgreedAmount, setEditAgreedAmount] = useState(String(agreement.agreed_amount));

  function downloadReceipt(highlightInstallment?: number) {
    try {
      const pdf = buildDebtAgreementReceiptPDF({
        agreement,
        installments,
        tenantFirstName,
        tenantLastName,
        tenantCpf,
        apartmentUnit,
        condominiumName,
        adminName,
        highlightInstallment,
      });
      const blob = new Blob([pdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const prefix = highlightInstallment ? `Parcela${highlightInstallment}` : 'Acordo';
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `${prefix}_${apartmentUnit}_${tenantFirstName}_${tenantLastName}.pdf`.replace(/\s+/g, '_'),
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(highlightInstallment ? `Recibo da parcela ${highlightInstallment} gerado!` : 'Documento do acordo gerado!');
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
  }

  const paidCount = installments.filter(i => i.paid).length;
  const paidAmount = installments.filter(i => i.paid).reduce((s, i) => s + i.amount, 0);
  const remaining = agreement.agreed_amount - paidAmount;

  const statusColor = agreement.status === 'settled'
    ? 'border-green-500/30 bg-green-500/5'
    : agreement.status === 'cancelled'
    ? 'border-muted bg-muted/20'
    : 'border-amber-500/30 bg-amber-500/5';

  const statusLabel = agreement.status === 'settled' ? '✅ Quitado' : agreement.status === 'cancelled' ? '❌ Cancelado' : '⏳ Em andamento';

  return (
    <div className={`rounded-xl border ${statusColor} overflow-hidden`}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Handshake className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">
              {agreement.installment_count}x de {formatCurrency(agreement.installment_value)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              agreement.status === 'settled' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
              : agreement.status === 'cancelled' ? 'bg-muted text-muted-foreground'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
            }`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Original: {formatCurrency(agreement.original_amount)} →
            Acordado: {formatCurrency(agreement.agreed_amount)}
            {paidCount > 0 && ` · ${paidCount}/${agreement.installment_count} pagas`}
            {remaining > 0 && agreement.status === 'active' && ` · Falta: ${formatCurrency(remaining)}`}
          </p>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Notes */}
          {agreement.notes && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{agreement.notes}</p>
          )}

          {/* Installments */}
          <div className="space-y-1.5">
            {installments.map(inst => (
              <InstallmentRow key={inst.id} inst={inst} agreement={agreement} previousTenantId={previousTenantId}
                onReceiptClick={(num) => downloadReceipt(num)} />
            ))}
          </div>

          {/* Actions — Editar e Doc. Acordo sempre visíveis; Quitar/Cancelar só quando ativo; Excluir/Reativar quando cancelado */}
          <div className="flex gap-2 pt-1 flex-wrap">
            {/* Editar: apenas acordos ativos */}
            {agreement.status === 'active' && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                setEditNotes(agreement.notes ?? '');
                setEditAgreedAmount(String(agreement.agreed_amount));
                setEditModal(true);
              }}>
                <Pencil className="w-3 h-3" /> Editar
              </Button>
            )}
            {agreement.status === 'active' && (<>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700"
                onClick={() => updateAgreement.mutate({ id: agreement.id, previousTenantId, status: 'settled' })}>
                <CheckCircle2 className="w-3 h-3" /> Quitar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => cancelAgreement.mutate({ id: agreement.id, previousTenantId })}>
                <XCircle className="w-3 h-3" /> Cancelar
              </Button>
            </>)}
            {/* Reativar: apenas acordos cancelados */}
            {agreement.status === 'cancelled' && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700"
                onClick={() => updateAgreement.mutate({ id: agreement.id, previousTenantId, status: 'active' })}>
                <RotateCcw className="w-3 h-3" /> Reativar
              </Button>
            )}
            {/* Excluir: apenas acordos cancelados ou quitados */}
            {(agreement.status === 'cancelled' || agreement.status === 'settled') && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => {
                  if (!window.confirm('Excluir este acordo e todas as suas parcelas? Essa ação não pode ser desfeita.')) return;
                  deleteAgreement.mutate({ id: agreement.id, previousTenantId });
                }}
                disabled={deleteAgreement.isPending}>
                <Trash2 className="w-3 h-3" /> Excluir
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary hover:text-primary"
              onClick={() => downloadReceipt()}>
              <FileText className="w-3 h-3" /> Doc. Acordo
            </Button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Acordo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Valor Total do Acordo (R$)</Label>
              <Input type="number" className="mt-1" value={editAgreedAmount}
                onChange={e => setEditAgreedAmount(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input className="mt-1" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Ex: 8 parcelas com juros de 2x..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(false)}>Cancelar</Button>
            <Button onClick={() => {
              const newAmount = parseFloat(editAgreedAmount);
              const isForgiving = !isNaN(newAmount) && newAmount === 0;
              updateAgreement.mutate({
                id: agreement.id, previousTenantId,
                agreed_amount: !isNaN(newAmount) ? newAmount : agreement.agreed_amount,
                notes: editNotes || null,
                // Se zerou o valor → marca como quitado (dívida perdoada)
                ...(isForgiving ? { status: 'settled' } : {}),
              });
              setEditModal(false);
            }} disabled={updateAgreement.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DebtAgreementPanelProps {
  previousTenantId: string;
  apartmentId: string;
  totalOwed: number;
  tenantFirstName?: string;
  tenantLastName?: string;
  tenantCpf?: string | null;
  apartmentUnit?: string;
  condominiumName?: string;
}

export function DebtAgreementPanel({ previousTenantId, apartmentId, totalOwed, tenantFirstName = '', tenantLastName = '', tenantCpf = null, apartmentUnit = '', condominiumName = '' }: DebtAgreementPanelProps) {
  const { data: agreements = [], isLoading } = useDebtAgreements(previousTenantId);
  const createAgreement = useCreateDebtAgreement();
  const updateAgreementPanel = useUpdateDebtAgreement();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    originalAmount: String(totalOwed),
    agreedAmount: String(totalOwed),
    installmentCount: '1',
    startDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const installmentValue = parseFloat(form.agreedAmount) / (parseInt(form.installmentCount) || 1);
  const hasActive = agreements.some(a => a.status === 'active');

  async function handleCreate() {
    const orig = parseFloat(form.originalAmount);
    const agreed = parseFloat(form.agreedAmount);
    const count = agreed === 0 ? 0 : parseInt(form.installmentCount);
    if (!orig || isNaN(agreed)) { return; }
    // Dívida perdoada: cria acordo com 1 parcela simbólica e imediatamente quita
    if (agreed === 0) {
      const ag = await createAgreement.mutateAsync({
        previousTenantId,
        apartmentId,
        originalAmount: orig,
        agreedAmount: 0,
        installmentCount: 1,
        installmentValue: 0,
        notes: form.notes || 'Dívida perdoada',
        startDate: form.startDate,
      });
      // Marca como quitado imediatamente
      await updateAgreementPanel.mutateAsync({ id: ag.id, previousTenantId, status: 'settled' });
      setShowCreate(false);
      return;
    }
    if (!count) { return; }
    await createAgreement.mutateAsync({
      previousTenantId,
      apartmentId,
      originalAmount: orig,
      agreedAmount: agreed,
      installmentCount: count,
      installmentValue: Math.round((agreed / count) * 100) / 100,
      notes: form.notes,
      startDate: form.startDate,
    });
    setShowCreate(false);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Handshake className="w-3.5 h-3.5" /> Acordos de Dívida
        </p>
        {!hasActive && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
            setForm({ originalAmount: String(totalOwed), agreedAmount: String(totalOwed), installmentCount: '1', startDate: new Date().toISOString().split('T')[0], notes: '' });
            setShowCreate(true);
          }}>
            <Plus className="w-3 h-3" /> Novo Acordo
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : agreements.length === 0 ? (
        <div className="text-center py-4 rounded-xl border border-dashed border-border">
          <Handshake className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Nenhum acordo registrado</p>
          <p className="text-xs text-muted-foreground/60">Crie um acordo para parcelar a dívida</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agreements.map(ag => (
            <AgreementCard key={ag.id} agreement={ag} previousTenantId={previousTenantId}
              tenantFirstName={tenantFirstName} tenantLastName={tenantLastName}
              tenantCpf={tenantCpf} apartmentUnit={apartmentUnit} condominiumName={condominiumName} />
          ))}
          {!hasActive && (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => {
              setForm({ originalAmount: String(totalOwed), agreedAmount: String(totalOwed), installmentCount: '1', startDate: new Date().toISOString().split('T')[0], notes: '' });
              setShowCreate(true);
            }}>
              <Plus className="w-3 h-3" /> Novo Acordo
            </Button>
          )}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" /> Novo Acordo de Dívida
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dívida Original (R$)</Label>
                <Input type="number" className="mt-1" value={form.originalAmount}
                  onChange={e => setForm(p => ({ ...p, originalAmount: e.target.value }))} />
              </div>
              <div>
                <Label>Valor do Acordo (R$)</Label>
                <Input type="number" className="mt-1" value={form.agreedAmount}
                  onChange={e => setForm(p => ({ ...p, agreedAmount: e.target.value }))}
                  placeholder="Pode incluir juros" />
                {parseFloat(form.agreedAmount) > parseFloat(form.originalAmount) && (
                  <p className="text-xs text-amber-600 mt-1">
                    +{formatCurrency(parseFloat(form.agreedAmount) - parseFloat(form.originalAmount))} de juros/encargos
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número de Parcelas</Label>
                <Input type="number" min="1" max="120" className="mt-1" value={form.installmentCount}
                  onChange={e => setForm(p => ({ ...p, installmentCount: e.target.value }))} />
              </div>
              <div>
                <Label>Valor por Parcela</Label>
                <div className="mt-1 h-9 px-3 flex items-center rounded-md border border-border bg-muted/40 text-sm font-semibold">
                  {isNaN(installmentValue) ? '—' : formatCurrency(installmentValue)}
                </div>
              </div>
            </div>

            <div>
              <Label>Primeira Parcela em</Label>
              <Input type="date" className="mt-1" value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>

            <div>
              <Label>Observações <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input className="mt-1" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Ex: 8 parcelas sendo 6 da dívida + 2 de juros" />
            </div>

            <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-semibold text-foreground">{form.installmentCount} parcelas</span> de {isNaN(installmentValue) ? '—' : formatCurrency(installmentValue)}</p>
              <p>Total: {formatCurrency(parseFloat(form.agreedAmount) || 0)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createAgreement.isPending}>
              {createAgreement.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar Acordo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
