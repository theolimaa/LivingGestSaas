import { useState } from 'react';
import { Download, FileBarChart2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Layout from '@/components/Layout';
import { formatCurrency, MONTHS, YEARS, getPeriodAndDueDate, getRecordStatus } from '@/lib/utils-app';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import { useFinancialRecordsByYear, FinancialRecordDB, calcReceived, calcOwed } from '@/hooks/useFinancial';
import { useContracts } from '@/hooks/useContracts';
import jsPDF from 'jspdf';

// ─── Classifica o status ───────────────────────────────────────────────────────
function computeStatus(
  record: FinancialRecordDB,
  paymentDay?: number | null,
  contractStartDate?: string | null
): 'paid' | 'overdue' | 'pending' {
  if (record.paid) return 'paid';
  return getRecordStatus(record.month, paymentDay, contractStartDate);
}

// ─── Retorna YYYY-MM-DD do vencimento ──────────────────────────────────────────
function getDueDate(
  month: string,
  contractStartDate: string | null | undefined,
  paymentDay: number | null | undefined
): string {
  const { dueDateStr } = getPeriodAndDueDate(month, contractStartDate ?? null, paymentDay ?? 1);
  return dueDateStr;
}

export default function MonthlyReport() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedCondo, setSelectedCondo] = useState('all');

  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: allTenants = [] } = useTenants();
  const { data: financialRecords = [], isLoading } = useFinancialRecordsByYear(Number(selectedYear));
  const { data: contracts = [] } = useContracts();

  const monthIndex = Number(selectedMonth); // 0-indexed

  // ── Enriquecer registros com due date ────────────────────────────────────────
  const enriched = financialRecords.map(r => {
    const apt = apartments.find(a => a.id === r.apartment_id);
    const contract = contracts.find(c => c.id === r.contract_id);
    const dueDate = getDueDate(r.month, contract?.start_date, contract?.payment_day);
    const status = computeStatus(r, contract?.payment_day, contract?.start_date);
    return { ...r, apt, contract, dueDate, computedStatus: status };
  });

  // ── Filtro ────────────────────────────────────────────────────────────────────
  //
  // PAGOS     → filtra por payment_date (quando o dinheiro entrou)
  // NÃO PAGOS → filtra por data de vencimento (quando deveria ter entrado)
  //
  // Isso garante que "vencimento em fevereiro" aparece sempre em fevereiro,
  // seja recebido, a receber ou inadimplente.
  //
  const filtered = enriched.filter(r => {
    // Exclui registros cujo período de referência é anterior a 2026
    if (r.month < '2026-01') return false;
    // Registros nao pagos de contratos encerrados nao devem aparecer no relatório
    if (!r.paid && r.contract?.status === 'ended') return false;

    if (selectedCondo !== 'all') {
      if (r.apt?.condominium_id !== selectedCondo) return false;
    }

    let dateForFilter: string;
    if (r.paid && r.payment_date) {
      dateForFilter = r.payment_date;
    } else {
      dateForFilter = r.dueDate;
    }

    const [y, m] = dateForFilter.split('-').map(Number);
    return y === Number(selectedYear) && m - 1 === monthIndex;
  });

  // ── Agrupado por condomínio ──────────────────────────────────────────────────
  const grouped = condominiums
    .filter(c => selectedCondo === 'all' || c.id === selectedCondo)
    .map(condo => {
      const condoApts = apartments.filter(a => a.condominium_id === condo.id);
      const condoRecords = filtered.filter(r =>
        condoApts.some(a => a.id === r.apartment_id)
      );

      const rows = condoApts.map(apt => {
        const record = condoRecords.find(r => r.apartment_id === apt.id);
        const tenant = allTenants.find(t => t.id === record?.tenant_id);

        if (record) {
          return { apt, record, tenant, status: record.computedStatus, isVacant: false };
        }

        // Sem registro: vago = não tem nenhum tenant ativo (não arquivado) no apartamento
        const hasActiveTenant = allTenants.some(t => t.apartment_id === apt.id && !t.archived_at);

        return { apt, record: null, tenant: null, status: null, isVacant: !hasActiveTenant };
      });

      const totalPaid = condoRecords.filter(r => r.computedStatus === 'paid').reduce((s, r) => s + calcReceived(r), 0);
      const totalPending = condoRecords.filter(r => r.computedStatus === 'pending').reduce((s, r) => s + r.rent_value, 0);
      const totalOverdue = condoRecords.filter(r => r.computedStatus === 'overdue').reduce((s, r) => s + r.rent_value, 0);
      const occupied = condoApts.filter(apt => condoRecords.some(r => r.apartment_id === apt.id)).length;

      return { condo, rows, totalPaid, totalPending, totalOverdue, occupied, total: condoApts.length };
    });

  const grandPaid = grouped.reduce((s, g) => s + g.totalPaid, 0);
  const grandPending = grouped.reduce((s, g) => s + g.totalPending, 0);
  const grandOverdue = grouped.reduce((s, g) => s + g.totalOverdue, 0);

  function generatePDF() {
    const doc = new jsPDF();
    const ml = 15;
    let y = 18;
    const monthLabel = MONTHS[Number(selectedMonth)];
    const condoLabel = selectedCondo === 'all' ? 'Todos os condomínios' : condominiums.find(c => c.id === selectedCondo)?.name ?? '';
    const today = new Date().toLocaleDateString('pt-BR');

    const addLine = (color: [number, number, number] = [200, 200, 200]) => {
      doc.setDrawColor(...color);
      doc.line(ml, y, 195, y);
      y += 3;
    };

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Living Gest — Relatório Mensal', ml, 12);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`${monthLabel} ${selectedYear} • ${condoLabel} • Emitido em ${today}`, ml, 22);
    y = 36;

    doc.setFillColor(245, 247, 250);
    doc.rect(ml - 2, y - 4, 182, 20, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text('RESUMO GERAL', ml, y + 1);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 197, 94); doc.text(`Recebido: ${formatCurrency(grandPaid)}`, ml, y);
    doc.setTextColor(234, 179, 8); doc.text(`A Receber: ${formatCurrency(grandPending)}`, ml + 60, y);
    doc.setTextColor(239, 68, 68); doc.text(`Inadimplente: ${formatCurrency(grandOverdue)}`, ml + 120, y);
    y += 10;
    addLine([180, 180, 180]);

    for (const g of grouped) {
      if (y > 255) { doc.addPage(); y = 15; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(g.condo.name, ml, y);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`${g.occupied}/${g.total} ocupados`, ml + 90, y);
      doc.setTextColor(34, 197, 94); doc.text(`Rec: ${formatCurrency(g.totalPaid)}`, ml + 130, y);
      doc.setTextColor(239, 68, 68); doc.text(`Inad: ${formatCurrency(g.totalOverdue)}`, ml + 160, y);
      y += 6;
      doc.setFillColor(230, 235, 245);
      doc.rect(ml - 2, y - 3, 182, 6, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
      doc.text('Apto', ml, y + 1); doc.text('Inquilino', ml + 18, y + 1); doc.text('Valor', ml + 100, y + 1);
      doc.text('Pagamento', ml + 125, y + 1); doc.text('Status', ml + 160, y + 1);
      y += 7;

      for (const row of g.rows) {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        doc.text(row.apt.unit_number, ml, y);
        const tenantName = row.tenant ? `${row.tenant.first_name} ${row.tenant.last_name}` : '—';
        doc.text(doc.splitTextToSize(tenantName, 75)[0], ml + 18, y);
        doc.text(row.record ? formatCurrency(row.record.rent_value) : '—', ml + 100, y);
        doc.text(row.record?.payment_date ?? '—', ml + 125, y);
        if (row.status === 'paid') doc.setTextColor(34, 197, 94);
        else if (row.status === 'overdue') doc.setTextColor(239, 68, 68);
        else if (row.status === 'pending') doc.setTextColor(234, 179, 8);
        else doc.setTextColor(150, 150, 150);
        const statusLabel = row.status === 'paid' ? 'Pago' : row.status === 'overdue' ? 'Inadimplente' : row.status === 'pending' ? 'A Receber' : row.isVacant ? 'Vago' : '—';
        doc.text(statusLabel, ml + 160, y);
        doc.setTextColor(30, 30, 30);
        y += 5;
      }
      y += 4;
      addLine();
    }

    doc.save(`Relatorio-${monthLabel}-${selectedYear}.pdf`);
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileBarChart2 className="w-6 h-6 text-primary" />
              Relatório Mensal
            </h1>
            <p className="text-muted-foreground text-sm">Visão completa de todos os apartamentos por mês</p>
          </div>
          <Button onClick={generatePDF} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Baixar PDF
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-24 sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
          </Select>

          <Select value={selectedCondo} onValueChange={setSelectedCondo}>
            <SelectTrigger className="w-36 sm:w-52"><SelectValue placeholder="Todos os condomínios" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os condomínios</SelectItem>
              {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Recebido</p>
            <p className="text-2xl font-bold" style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(grandPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pagamentos recebidos no mês</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">A Receber</p>
            <p className="text-2xl font-bold" style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(grandPending)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Vencimento ainda não chegou</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Inadimplente</p>
            <p className="text-2xl font-bold" style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(grandOverdue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Venceu e não pagou</p>
          </div>
        </div>

        {/* Tabelas */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6">
            {grouped.map(g => (
              <div key={g.condo.id} className="bg-card border border-border rounded-xl overflow-x-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-muted/40 border-b border-border gap-1">
                  <h2 className="font-semibold">{g.condo.name}</h2>
                  <div className="flex gap-3 text-xs sm:text-sm flex-wrap">
                    <span className="text-muted-foreground">{g.occupied}/{g.total} ocupados</span>
                    <span style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(g.totalPaid)} recebido</span>
                    {g.totalPending > 0 && <span style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(g.totalPending)} a receber</span>}
                    {g.totalOverdue > 0 && <span style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(g.totalOverdue)} inad.</span>}
                  </div>
                </div>
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left px-3 py-2">Apto</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Inquilino</th>
                      <th className="text-right px-3 py-2">Valor</th>
                      <th className="text-center px-3 py-2 hidden sm:table-cell">Pagamento</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(row => (
                      <tr key={row.apt.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{row.apt.unit_number}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {row.tenant ? `${row.tenant.first_name} ${row.tenant.last_name}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {row.record ? formatCurrency(row.record.rent_value) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground hidden sm:table-cell">
                          {row.record?.payment_date ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.status === 'paid' && <span className="badge-active">Pago</span>}
                          {row.status === 'overdue' && <span className="badge-overdue">Inadimplente</span>}
                          {row.status === 'pending' && <span className="badge-unpaid">A Receber</span>}
                          {!row.status && row.isVacant && <span className="text-xs text-muted-foreground">Vago</span>}
                          {!row.status && !row.isVacant && <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
