import { useState } from 'react';
import { FileText, Download, Loader2, FolderArchive, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import Layout from '@/components/Layout';
import { MONTHS, YEARS, formatCurrency } from '@/lib/utils-app';
import { useAllFinancialRecords, FinancialRecordDB, calcReceived } from '@/hooks/useFinancial';
import { useApartments } from '@/hooks/useApartments';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useTenants } from '@/hooks/useTenants';
import { useContracts } from '@/hooks/useContracts';
import { useAuth } from '@/hooks/useAuth';
import { buildReceiptPDF, generateReceiptCode } from '@/lib/generateReceiptPDF';
import JSZip from 'jszip';
import { toast } from 'sonner';

export default function Receipts() {
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [selectedYear,  setSelectedYear]  = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedCondo, setSelectedCondo] = useState('all');
  const [downloading,   setDownloading]   = useState(false);

  const { user } = useAuth();
  const { data: allRecords   = [] } = useAllFinancialRecords();
  const { data: apartments   = [] } = useApartments();
  const { data: condominiums = [] } = useCondominiums();
  const { data: allTenants   = [] } = useTenants();
  const { data: contracts    = [] } = useContracts();

  const monthIdx = Number(selectedMonth);
  const yearNum  = Number(selectedYear);

  // Pagamentos cujo payment_date cai no mês selecionado — mesma lógica da Receita
  const paidInPeriod = allRecords.filter(r => {
    if (!r.paid || !r.payment_date) return false;
    const [y, m] = r.payment_date.split('-').map(Number);
    if (y !== yearNum || m - 1 !== monthIdx) return false;
    if (selectedCondo === 'all') return true;
    const apt = apartments.find(a => a.id === r.apartment_id);
    return apt?.condominium_id === selectedCondo;
  });

  // Agrupar por condomínio para preview
  const grouped = condominiums
    .filter(c => selectedCondo === 'all' || c.id === selectedCondo)
    .map(condo => {
      const condoApts    = apartments.filter(a => a.condominium_id === condo.id);
      const condoRecords = paidInPeriod.filter(r => condoApts.some(a => a.id === r.apartment_id));
      return { condo, records: condoRecords };
    })
    .filter(g => g.records.length > 0);

  const totalReceipts = paidInPeriod.length;
  const totalValue    = paidInPeriod.reduce((s, r) => s + calcReceived(r), 0);

  async function handleDownload() {
    if (totalReceipts === 0) {
      toast.error('Nenhum recibo encontrado para o período selecionado.');
      return;
    }
    setDownloading(true);

    const zip       = new JSZip();
    const adminName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';
    const today     = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Pré-indexar por apartamento para histórico anual
    const recordsByApt: Record<string, FinancialRecordDB[]> = {};
    for (const r of allRecords) {
      if (!recordsByApt[r.apartment_id]) recordsByApt[r.apartment_id] = [];
      recordsByApt[r.apartment_id].push(r);
    }

    let count = 0, errors = 0;

    for (const r of paidInPeriod) {
      try {
        const apt      = apartments.find(a => a.id === r.apartment_id);
        const condo    = apt ? condominiums.find(c => c.id === apt.condominium_id) : null;
        const tenant   = allTenants.find(t => t.id === r.tenant_id);
        const contract = contracts.find(c => c.id === r.contract_id);
        if (!apt || !condo || !tenant) { errors++; continue; }

        const pdfBytes = buildReceiptPDF({
          record: r,
          apartmentUnit:        apt.unit_number,
          condominiumName:      condo.name,
          tenantFirstName:      tenant.first_name,
          tenantLastName:       tenant.last_name,
          tenantCpf:            tenant.cpf,
          contractPaymentDay:   contract?.payment_day,
          contractStartDate:    contract?.start_date,
          contractCautionPaid:  contract?.caution_paid,
          contractCautionValue: contract?.caution_value,
          contractCautionDate:  contract?.caution_date,
          allYearRecords:       recordsByApt[r.apartment_id] ?? [],
          adminName,
          today,
        });

        const code     = generateReceiptCode(condo.name, apt.unit_number, contract?.start_date);
        const safeName = `${tenant.first_name}_${tenant.last_name}`.replace(/[^a-zA-Z0-9_]/g, '');
        zip.file(`${condo.name}/Recibo-Apto${apt.unit_number}-${safeName}-${code}.pdf`, pdfBytes);
        count++;
      } catch (e) {
        console.error('Erro ao gerar recibo:', e);
        errors++;
      }
    }

    try {
      const monthLabel = MONTHS[monthIdx];
      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Recibos-${monthLabel}-${selectedYear}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      if (errors > 0) toast.warning(`${count} recibos baixados, ${errors} falharam.`);
      else toast.success(`${count} recibo${count !== 1 ? 's' : ''} baixado${count !== 1 ? 's' : ''} com sucesso!`);
    } catch {
      toast.error('Erro ao gerar o arquivo ZIP.');
    } finally {
      setDownloading(false);
    }
  }

  const monthLabel = MONTHS[monthIdx];
  const condoName  = condominiums.find(c => c.id === selectedCondo)?.name;

  return (
    <Layout>
      <div className="page-content">

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-primary" />
            Recibos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Selecione o período e baixe todos os recibos em um arquivo ZIP.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 max-w-2xl">
          <h2 className="font-semibold text-base">Selecionar Período</h2>

          <div className="flex flex-wrap gap-3">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={selectedCondo} onValueChange={setSelectedCondo}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Todos os condomínios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os condomínios</SelectItem>
                {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {totalReceipts > 0 ? (
            <div className="bg-muted/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-primary" />
                  <span className="font-medium text-sm">
                    {monthLabel} {selectedYear}{selectedCondo !== 'all' && ` — ${condoName}`}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{totalReceipts} recibo{totalReceipts !== 1 ? 's' : ''}</p>
                  <p className="text-sm font-bold" style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(totalValue)}</p>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-border">
                {grouped.map(g => (
                  <div key={g.condo.id} className="flex items-center justify-between text-sm px-1 py-0.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-muted-foreground">{g.condo.name}</span>
                    </div>
                    <span className="text-xs font-medium tabular-nums">
                      {g.records.length} recibo{g.records.length !== 1 ? 's' : ''} · {formatCurrency(g.records.reduce((s, r) => s + calcReceived(r), 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-xl p-6 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento em <strong>{monthLabel} {selectedYear}</strong>
                {selectedCondo !== 'all' && ` para ${condoName}`}.
              </p>
            </div>
          )}

          <Button
            onClick={handleDownload}
            disabled={downloading || totalReceipts === 0}
            className="w-full sm:w-auto btn-primary-glow gap-2"
            size="lg"
          >
            {downloading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando recibos...</>
            ) : (
              <><Download className="w-4 h-4" />Baixar {totalReceipts > 0 ? `${totalReceipts} recibo${totalReceipts !== 1 ? 's' : ''}` : 'recibos'} — {monthLabel} {selectedYear}</>
            )}
          </Button>
        </div>

      </div>
    </Layout>
  );
}
