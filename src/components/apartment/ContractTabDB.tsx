import { useState, useRef } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useContract, useUpsertContract, useCloseContract, useUndoCloseContract, ContractDB } from '@/hooks/useContracts';
import { useBulkGeneratePeriods, useFinancialRecords } from '@/hooks/useFinancial';
import { formatCurrency, formatDate, MONTHS } from '@/lib/utils-app';
import { toast } from 'sonner';

function generateMonthOptions(startDate: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const now = new Date();
  const future = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= future) {
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const value = `${year}-${String(month + 1).padStart(2, '0')}`;
    options.push({ value, label: `${MONTHS[month]} ${year}` });
    cur = new Date(year, month + 1, 1);
  }
  return options;
}

export default function ContractTabDB({ tenantId, apartmentId, tenantName, tenantCpf, condominiumName, apartmentUnit, adminName }: {
  tenantId: string;
  apartmentId: string;
  tenantCpf?: string | null;
  condominiumName?: string;
  apartmentUnit?: string;
  adminName?: string;
  tenantName: string;
}) {
  const { data: contract, isLoading } = useContract(tenantId);
  const upsertContract = useUpsertContract();
  const closeContract = useCloseContract();
  const undoClose = useUndoCloseContract();
  const bulkGenerate = useBulkGeneratePeriods();

  const [editing, setEditing] = useState(false);
  const [showClose, setShowClose] = useState(false);

  function handleCautionReceipt() {
    if (!contract?.caution_paid || !contract.caution_value) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ml = 20;
    let y = 20;
    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const addText = (text: string, size = 10, bold = false) => {
      doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, 170);
      doc.text(lines, ml, y); y += lines.length * (size * 0.45) + 2;
    };
    const addLine = () => { doc.setDrawColor(200, 200, 200); doc.line(ml, y, 190, y); y += 4; };
    addText(`RECIBO DE CAUCAO - APTO ${apartmentUnit ?? ''} - ${tenantName} - ${today}`, 12, true);
    addLine();
    addText(`Recebi de ${tenantName}${tenantCpf ? ', CPF ' + tenantCpf : ''} a titulo de caucao referente ao contrato de locacao do apartamento ${apartmentUnit ?? ''} do ${condominiumName ?? ''}, a importancia de ${formatCurrency(contract.caution_value)}${contract.caution_date ? ', paga em ' + formatDate(contract.caution_date) : ''}.`, 10);
    y += 4; addLine();
    addText(`Fortaleza, ${today} - ${adminName ?? 'Administrador'} - Confira seu recibo.`, 9);
    const blob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `Caucao_${(apartmentUnit ?? '').replace(' ', '_')}_${tenantName.replace(' ', '_')}.pdf` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Recibo de caucao gerado!');
  }
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Calcula aluguel proporcional ao encerrar contrato
  function calcProportional(rentValue: number, paymentDay: number, endDateStr: string): {
    days: number; periodDays: number; value: number; periodStart: string; periodEnd: string;
  } {
    const end = new Date(endDateStr + 'T12:00:00');
    // Início do período: último dia de pagamento antes ou igual à data de encerramento
    let pStart = new Date(end.getFullYear(), end.getMonth(), paymentDay);
    if (pStart > end) pStart = new Date(end.getFullYear(), end.getMonth() - 1, paymentDay);
    // Fim do período
    const pEnd = new Date(pStart.getFullYear(), pStart.getMonth() + 1, paymentDay);
    const periodDays = Math.round((pEnd.getTime() - pStart.getTime()) / 86400000);
    const daysStayed = Math.round((end.getTime() - pStart.getTime()) / 86400000) + 1;
    const value = Math.round((rentValue * daysStayed / periodDays) * 100) / 100;
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return { days: daysStayed, periodDays, value, periodStart: fmt(pStart), periodEnd: fmt(pEnd) };
  }
  const [form, setForm] = useState<Partial<ContractDB>>({});

  const [generatingPeriods, setGeneratingPeriods] = useState(false);
  const [showPaymentDayModal, setShowPaymentDayModal] = useState(false);
  const [newPaymentDay, setNewPaymentDay] = useState<number | null>(null);
  const [paymentDayFromMonth, setPaymentDayFromMonth] = useState<string>('');
  const pendingSaveRef = useRef<Partial<ContractDB> | null>(null);

  const lastCloseRef = useRef<{
    contractId: string; tenantId: string; prevTenantId: string; apartmentId: string;
  } | null>(null);

  function startEdit() {
    setForm(contract ?? {});
    setEditing(true);
  }

  async function handleSave() {
    if (!form.start_date || !form.rent_value) return;

    const isNewContract = !contract?.id;
    const paymentDayChanged = !isNewContract && form.payment_day && contract?.payment_day !== form.payment_day;

    if (paymentDayChanged) {
      pendingSaveRef.current = form;
      setNewPaymentDay(form.payment_day ?? null);
      const now = new Date();
      setPaymentDayFromMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      setShowPaymentDayModal(true);
      return;
    }

    await doSave(form, isNewContract);
  }

  async function doSave(
    formData: Partial<ContractDB>,
    isNew: boolean,
    desiredPaymentDay?: number | null,
    desiredPaymentDate?: string | null
  ) {
    // Se há mudança de dia agendada, mantém payment_day com o valor ANTIGO no banco.
    // O novo dia entra via desired_payment_day a partir de desired_payment_date.
    const effectivePaymentDay = desiredPaymentDay
      ? (contract?.payment_day ?? formData.payment_day ?? null)
      : (formData.payment_day ?? null);

    let result: ContractDB;
    try {
      result = await upsertContract.mutateAsync({
        id: formData.id ?? contract?.id,
        tenant_id: tenantId,
        start_date: formData.start_date!,
        end_date: formData.end_date ?? null,
        payment_day: effectivePaymentDay,
        desired_payment_day: desiredPaymentDay ?? null,
        desired_payment_date: desiredPaymentDate ?? null,
        rent_value: Number(formData.rent_value),
        observations: formData.observations ?? null,
        status: 'active',
        caution_paid: formData.caution_paid ?? false,
        caution_value: formData.caution_value ? Number(formData.caution_value) : null,
        caution_date: formData.caution_date ?? null,
      });
    } catch (e) {
      // upsertContract.onError já exibiu o toast; apenas interrompemos aqui
      return;
    }

    // ✅ CORREÇÃO CRÍTICA: bulkGenerate APENAS para contratos novos
    // Nunca recriar períodos em edições — isso apagaria os registros de pagamento
    if (isNew && result?.id) {
      try {
        await bulkGenerate.mutateAsync({
          apartmentId,
          tenantId,
          contractId: result.id,
          startDate: formData.start_date!,
          rentValue: Number(formData.rent_value),
          paymentDay: formData.payment_day ?? 1,
        });
      } catch (e) {
        // Contrato foi salvo com sucesso — notificar que os períodos falharam
        // para que o usuário use o botão "Gerar Períodos" manualmente
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Contrato salvo, mas falha ao gerar períodos: ${msg}. Use o botão "Gerar Períodos".`, {
          duration: 10000,
        });
      }
    }

    setEditing(false);
  }

  async function handleManualGenerate() {
    if (!contract) return;
    setGeneratingPeriods(true);
    try {
      await bulkGenerate.mutateAsync({
        apartmentId,
        tenantId,
        contractId: contract.id,
        startDate: contract.start_date,
        rentValue: contract.rent_value,
        paymentDay: contract.payment_day ?? 1,
      });
    } catch (e) {
      // onError do mutation já exibe o toast com a mensagem real
      console.error('bulkGenerate error:', e);
    } finally {
      setGeneratingPeriods(false);
    }
  }

  async function handlePaymentDayConfirm() {
    if (!pendingSaveRef.current || !newPaymentDay || !paymentDayFromMonth) return;
    const formData = { ...pendingSaveRef.current };
    pendingSaveRef.current = null;
    setShowPaymentDayModal(false);
    // Supabase exige tipo date completo (YYYY-MM-DD) — usamos dia 01 como referência
    const desiredDateFull = paymentDayFromMonth + '-01';
    await doSave(formData, false, newPaymentDay, desiredDateFull);
  }

  async function handleClose() {
    if (!contract) return;
    const result = await closeContract.mutateAsync({ contractId: contract.id, tenantId, apartmentId, endDate });
    setShowClose(false);
    lastCloseRef.current = {
      contractId: result.contractId ?? contract.id,
      tenantId: result.tenantId ?? tenantId,
      prevTenantId: result.prevTenantId ?? '',
      apartmentId: result.apartmentId ?? apartmentId,
    };
    toast.success(`Contrato de ${tenantName} encerrado.`, {
      duration: 60000,
      action: {
        label: '↩ Desfazer',
        onClick: async () => {
          if (!lastCloseRef.current) return;
          await undoClose.mutateAsync(lastCloseRef.current);
          lastCloseRef.current = null;
        },
      },
    });
  }

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  if (!contract && !editing) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground mb-4">Nenhum contrato cadastrado</p>
        <Button onClick={() => { setForm({}); setEditing(true); }}>Adicionar Contrato</Button>
      </div>
    );
  }

  if (editing) {
    return (
      <>
        <div className="space-y-5">
          <h3 className="font-semibold">{contract ? 'Editar Contrato' : 'Novo Contrato'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início *</Label>
              <Input className="mt-1" type="date" value={form.start_date ?? ''} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Dia de Vencimento</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={31}
                placeholder="Ex: 15"
                value={form.payment_day ?? ''}
                onChange={e => setForm({ ...form, payment_day: Number(e.target.value) })}
              />
              {contract && form.payment_day && form.payment_day !== contract.payment_day && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Você será perguntado a partir de qual mês aplicar
                </p>
              )}
            </div>
            <div>
              <Label>Valor do Aluguel *</Label>
              <Input className="mt-1" type="number" step="0.01" placeholder="1500.00" value={form.rent_value ?? ''} onChange={e => setForm({ ...form, rent_value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input className="mt-1" value={form.observations ?? ''} onChange={e => setForm({ ...form, observations: e.target.value })} placeholder="Observações do contrato..." />
            </div>
          </div>

          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="font-semibold text-sm">Caução</p>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Caução paga?</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" name="caution_paid" checked={form.caution_paid === true} onChange={() => setForm({ ...form, caution_paid: true })} />
                  Sim
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" name="caution_paid" checked={!form.caution_paid} onChange={() => setForm({ ...form, caution_paid: false, caution_value: null, caution_date: null })} />
                  Não
                </label>
              </div>
            </div>
            {form.caution_paid && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor da Caução</Label>
                  <Input className="mt-1" type="number" step="0.01" placeholder="0.00" value={form.caution_value ?? ''} onChange={e => setForm({ ...form, caution_value: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input className="mt-1" type="date" value={form.caution_date ?? ''} onChange={e => setForm({ ...form, caution_date: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertContract.isPending || bulkGenerate.isPending}>
              {(upsertContract.isPending || bulkGenerate.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Contrato
            </Button>
          </div>
        </div>

        {/* Modal: a partir de qual mês aplicar a mudança de vencimento */}
        <Dialog open={showPaymentDayModal} onOpenChange={open => { if (!open) { setShowPaymentDayModal(false); pendingSaveRef.current = null; } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Mudança no Dia de Vencimento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                O dia de vencimento foi alterado de <strong>dia {contract?.payment_day}</strong> para <strong>dia {newPaymentDay}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                A partir de qual mês essa mudança deve ser aplicada?
              </p>
              <div>
                <Label>Aplicar a partir de</Label>
                <Select value={paymentDayFromMonth} onValueChange={setPaymentDayFromMonth}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o mês..." />
                  </SelectTrigger>
                  <SelectContent>
                    {generateMonthOptions(contract?.start_date ?? new Date().toISOString().split('T')[0]).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ Os registros de pagamento existentes <strong>não serão apagados</strong>. Apenas o dia de vencimento exibido será atualizado a partir do mês escolhido.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowPaymentDayModal(false); pendingSaveRef.current = null; }}>
                Cancelar
              </Button>
              <Button onClick={handlePaymentDayConfirm} disabled={!paymentDayFromMonth || upsertContract.isPending}>
                {upsertContract.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirmar Mudança
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Detalhes do Contrato</h3>
        <div className="flex flex-wrap gap-2">
          {contract?.status === 'active' && (
            <>
              <Button size="sm" variant="outline" onClick={startEdit}>Editar</Button>
              <Button size="sm" variant="destructive" onClick={() => setShowClose(true)}>
                <XCircle className="w-4 h-4 mr-2" /> Encerrar Contrato
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualGenerate}
            disabled={generatingPeriods || bulkGenerate.isPending}
            title="Gera os períodos financeiros caso não tenham sido criados automaticamente"
          >
            {generatingPeriods || bulkGenerate.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <RefreshCw className="w-4 h-4 mr-2" />}
            Gerar Períodos
          </Button>
        </div>
      </div>

      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${contract?.status === 'active' ? 'badge-active' : 'badge-closed'}`}>
        {contract?.status === 'active' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {contract?.status === 'active' ? 'Ativo' : 'Encerrado'}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Início do Contrato</p>
          <p className="font-semibold">{formatDate(contract?.start_date ?? '')}</p>
        </div>
        {contract?.end_date && (
          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Encerramento</p>
            <p className="font-semibold">{formatDate(contract.end_date)}</p>
          </div>
        )}
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Valor do Aluguel</p>
          <p className="font-semibold text-lg">{formatCurrency(contract?.rent_value ?? 0)}</p>
        </div>
        {contract?.payment_day && (
          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Dia de Vencimento</p>
            <p className="font-semibold">Todo dia {contract.payment_day}</p>
            {contract.desired_payment_day && contract.desired_payment_date && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Muda para dia {contract.desired_payment_day} a partir de{' '}
                {(() => {
                  const [y, m] = contract.desired_payment_date.split('-');
                  return `${MONTHS[Number(m) - 1]} ${y}`;
                })()}
              </p>
            )}
          </div>
        )}
        {contract?.caution_paid && (
          <div className="bg-muted/50 rounded-xl p-4 col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Caução</p>
                <p className="font-semibold text-sm">
                  Paga{contract.caution_value ? ` — ${formatCurrency(contract.caution_value)}` : ''}
                  {contract.caution_date ? ` em ${formatDate(contract.caution_date)}` : ''}
                </p>
              </div>
              {contract.caution_value && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={handleCautionReceipt}>
                  <FileText className="w-3.5 h-3.5" /> Recibo da Caução
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {contract?.observations && (
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Observações</p>
          <p className="text-sm">{contract.observations}</p>
        </div>
      )}

      <AlertDialog open={showClose} onOpenChange={setShowClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Encerrar Contrato
            </AlertDialogTitle>
            <AlertDialogDescription>
              O inquilino <strong>{tenantName}</strong> será movido para "Inquilinos Anteriores". Você terá <strong>1 minuto</strong> para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <div>
              <Label>Data de encerramento</Label>
              <Input className="mt-1" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            {contract && endDate && (() => {
              const pd = contract.payment_day ?? 1;
              const prop = calcProportional(contract.rent_value, pd, endDate);
              const isFullPeriod = prop.days >= prop.periodDays;
              return !isFullPeriod ? (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs space-y-1">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Período proporcional</p>
                  <p className="text-amber-700 dark:text-amber-400">
                    Período: {prop.periodStart} a {prop.periodEnd} ({prop.periodDays} dias)
                  </p>
                  <p className="text-amber-700 dark:text-amber-400">
                    Morou: {prop.days} dias → Aluguel proporcional: <strong>{formatCurrency(prop.value)}</strong>
                  </p>
                  <p className="text-amber-600/70 dark:text-amber-500/70">
                    O registro do último período será atualizado automaticamente para {formatCurrency(prop.value)}.
                  </p>
                </div>
              ) : null;
            })()}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose} disabled={closeContract.isPending} className="bg-destructive hover:bg-destructive/90">
              {closeContract.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Encerrar Contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
