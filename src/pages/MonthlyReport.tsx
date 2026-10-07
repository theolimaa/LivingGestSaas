import { useState } from 'react';
import { Download, FileBarChart2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Layout from '@/components/Layout';
import { formatCurrency, MONTHS, YEARS, getPeriodAndDueDate, computeRecordStatus, getRecordDueDate } from '@/lib/utils-app';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants, useAllPreviousTenants } from '@/hooks/useTenants';
import { isVacantAllMonth } from '@/lib/vacancy';
import { useFinancialRecordsByYear, FinancialRecordDB, calcReceived, calcOwed } from '@/hooks/useFinancial';
import { useContracts } from '@/hooks/useContracts';
import jsPDF from 'jspdf';

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)}/${y}`;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type RGB = [number, number, number];
const PDF_COLORS = {
  brand: [37, 99, 235] as RGB,
  brandDark: [29, 78, 216] as RGB,
  navy: [15, 23, 42] as RGB,
  ink: [30, 41, 59] as RGB,
  muted: [100, 116, 139] as RGB,
  mutedLight: [148, 163, 184] as RGB,
  border: [226, 232, 240] as RGB,
  zebra: [248, 250, 252] as RGB,
  paid: [22, 163, 74] as RGB,
  paidBg: [220, 252, 231] as RGB,
  overdue: [220, 38, 38] as RGB,
  overdueBg: [254, 226, 226] as RGB,
  pending: [161, 98, 7] as RGB,
  pendingBg: [254, 249, 195] as RGB,
};

function statusStyle(status: 'paid' | 'overdue' | 'pending' | null): { label: string; fg: RGB; bg: RGB } | null {
  if (status === 'paid') return { label: 'Pago', fg: PDF_COLORS.paid, bg: PDF_COLORS.paidBg };
  if (status === 'overdue') return { label: 'Inadimplente', fg: PDF_COLORS.overdue, bg: PDF_COLORS.overdueBg };
  if (status === 'pending') return { label: 'A Receber', fg: PDF_COLORS.pending, bg: PDF_COLORS.pendingBg };
  return null;
}

export default function MonthlyReport() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedCondo, setSelectedCondo] = useState('all');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: allTenants = [] } = useTenants();
  const { data: financialRecords = [], isLoading } = useFinancialRecordsByYear(Number(selectedYear));
  const { data: contracts = [] } = useContracts();
  const { data: previousTenants = [] } = useAllPreviousTenants();

  const monthIndex = Number(selectedMonth); // 0-indexed

  // inquilino → apartamento (ativos e anteriores), para decidir vacância pelo período dos contratos
  const tenantInfo = new Map<string, { apartmentId: string; name: string }>();
  for (const t of allTenants) tenantInfo.set(t.id, { apartmentId: t.apartment_id, name: '' });
  for (const p of previousTenants) {
    if (p.original_id && p.apartment_id && !tenantInfo.has(p.original_id)) tenantInfo.set(p.original_id, { apartmentId: p.apartment_id, name: '' });
  }

  // ── Enriquecer registros com due date ────────────────────────────────────────
  const enriched = financialRecords.map(r => {
    const apt = apartments.find(a => a.id === r.apartment_id);
    const contract = contracts.find(c => c.id === r.contract_id);
    const dueDate = getRecordDueDate(r.month, contract?.start_date, contract?.payment_day, contract?.desired_payment_day, contract?.desired_payment_date);
    const status = computeRecordStatus(r.paid, r.month, contract?.payment_day, contract?.start_date, contract?.desired_payment_day, contract?.desired_payment_date);
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

      const rows = condoApts.flatMap(apt => {
        // Um apartamento pode ter mais de um registro caindo no mesmo mês do relatório
        // (ex: aluguel do mês anterior venceu agora e não foi pago, e o do mês atual já foi pago).
        // Mostrar todos evita que um registro inadimplente fique escondido atrás de um pago.
        const records = condoRecords.filter(r => r.apartment_id === apt.id);

        if (records.length > 0) {
          return records.map(record => {
            const tenant = allTenants.find(t => t.id === record.tenant_id);
            return { apt, record, tenant, status: record.computedStatus, isVacant: false };
          });
        }

        // Sem registro: vago = nenhum contrato vigente no mês do relatório (mesmo critério do Índice de Vacância)
        const isVacant = isVacantAllMonth(apt.id, Number(selectedYear), monthIndex, contracts, tenantInfo);

        return [{ apt, record: null, tenant: null, status: null, isVacant }];
      });

      const totalPaid = condoRecords.filter(r => r.computedStatus === 'paid').reduce((s, r) => s + calcReceived(r), 0);
      const totalPending = condoRecords.filter(r => r.computedStatus === 'pending').reduce((s, r) => s + r.rent_value, 0);
      const totalOverdue = condoRecords.filter(r => r.computedStatus === 'overdue').reduce((s, r) => s + r.rent_value, 0);
      const totalOwed = rows.filter(r => r.status === 'paid' && r.record).reduce((s, r) => s + calcOwed(r.record!), 0);
      const occupied = condoApts.filter(apt => condoRecords.some(r => r.apartment_id === apt.id)).length;

      return { condo, rows, totalPaid, totalPending, totalOverdue, totalOwed, occupied, total: condoApts.length };
    });

  const grandPaid = grouped.reduce((s, g) => s + g.totalPaid, 0);
  const grandPending = grouped.reduce((s, g) => s + g.totalPending, 0);
  const grandOverdue = grouped.reduce((s, g) => s + g.totalOverdue, 0);
  const grandOwed = grouped.reduce((s, g) => s + g.totalOwed, 0);

  async function generatePDF() {
    setGeneratingPdf(true);
    try {
      const logoDataUrl = await loadImageAsDataUrl('/icon-192.png');
      const doc = new jsPDF();
      const ml = 15;
      const pageRight = 195;
      const pageBottom = 282;
      let y = 40;
      const monthLabel = MONTHS[Number(selectedMonth)];
      const condoLabel = selectedCondo === 'all' ? 'Todos os condomínios' : condominiums.find(c => c.id === selectedCondo)?.name ?? '';
      const today = new Date().toLocaleDateString('pt-BR');

      // ── Cabeçalho ──────────────────────────────────────────────────────────
      const drawMainHeader = () => {
        doc.setFillColor(...PDF_COLORS.brand);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setFillColor(...PDF_COLORS.brandDark);
        doc.rect(0, 28, 210, 2, 'F');

        const textX = logoDataUrl ? ml + 22 : ml;
        if (logoDataUrl) {
          try { doc.addImage(logoDataUrl, 'PNG', ml, 6, 16, 16); } catch { /* logo opcional */ }
        }
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text('Living Gest', textX, 14);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(219, 234, 254);
        doc.text('Relatório Mensal', textX, 20);

        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(`${monthLabel} ${selectedYear}`, pageRight, 12, { align: 'right' });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(219, 234, 254);
        doc.text(condoLabel, pageRight, 17, { align: 'right' });
        doc.text(`Emitido em ${today}`, pageRight, 22, { align: 'right' });
      };

      const drawContinuationHeader = () => {
        doc.setFillColor(...PDF_COLORS.navy);
        doc.rect(0, 0, 210, 12, 'F');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text('Living Gest — Relatório Mensal (continuação)', ml, 8);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(203, 213, 225);
        doc.text(`${monthLabel} ${selectedYear}`, pageRight, 8, { align: 'right' });
        y = 20;
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > pageBottom) {
          doc.addPage();
          drawContinuationHeader();
        }
      };

      drawMainHeader();

      // ── Resumo geral ──────────────────────────────────────────────────────
      const stats: { label: string; value: number; color: RGB; sub: string }[] = [
        { label: 'RECEBIDO', value: grandPaid, color: PDF_COLORS.paid, sub: 'Pagamentos no mês' },
        { label: 'A RECEBER', value: grandPending, color: PDF_COLORS.pending, sub: 'Vencimento não chegou' },
        { label: 'INADIMPLENTE', value: grandOverdue, color: PDF_COLORS.overdue, sub: 'Venceu e não pagou' },
        { label: 'DEVENDO', value: grandOwed, color: grandOwed > 0 ? PDF_COLORS.pending : PDF_COLORS.paid, sub: 'Saldo devedor dos pagos' },
      ];
      const boxGap = 4;
      const boxW = (pageRight - ml - boxGap * 3) / 4;
      const boxH = 24;
      stats.forEach((s, i) => {
        const bx = ml + i * (boxW + boxGap);
        doc.setDrawColor(...PDF_COLORS.border); doc.setLineWidth(0.3);
        doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'S');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_COLORS.muted);
        doc.text(s.label, bx + 3, y + 6);
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...s.color);
        doc.text(formatCurrency(s.value), bx + 3, y + 14.5);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_COLORS.mutedLight);
        doc.text(doc.splitTextToSize(s.sub, boxW - 6)[0], bx + 3, y + 20);
      });
      y += boxH + 10;

      // ── Colunas da tabela (relativas a ml) ────────────────────────────────
      const col = { apto: 0, ref: 13, inquilino: 28, valor: 103, pagamento: 122, devendo: 145, status: 178 };
      const inquilinoMaxWidth = col.valor - col.inquilino - 4;

      const drawTableHeader = () => {
        doc.setFillColor(...PDF_COLORS.zebra);
        doc.rect(ml - 2, y - 4, 182, 7, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_COLORS.muted);
        doc.text('APTO', ml + col.apto, y);
        doc.text('INQUILINO', ml + col.inquilino, y);
        doc.text('VALOR', ml + col.valor, y, { align: 'right' });
        doc.text('PAGAMENTO', ml + col.pagamento, y, { align: 'center' });
        doc.text('DEVENDO', ml + col.devendo, y, { align: 'right' });
        doc.text('STATUS', ml + col.status, y, { align: 'center' });
        y += 6;
      };

      const drawCondoBar = (g: (typeof grouped)[number]) => {
        doc.setFillColor(...PDF_COLORS.navy);
        doc.roundedRect(ml - 2, y - 5, 182, 9, 1.5, 1.5, 'F');
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(g.condo.name, ml, y);

        const chips: { text: string; color: RGB }[] = [{ text: `${g.occupied}/${g.total} ocupados`, color: [203, 213, 225] }];
        chips.push({ text: `Rec ${formatCurrency(g.totalPaid)}`, color: [134, 239, 172] });
        if (g.totalOverdue > 0) chips.push({ text: `Inad ${formatCurrency(g.totalOverdue)}`, color: [252, 165, 165] });
        if (g.totalOwed > 0) chips.push({ text: `Dev ${formatCurrency(g.totalOwed)}`, color: [253, 224, 71] });
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        let cursorX = pageRight - 2;
        for (let i = chips.length - 1; i >= 0; i--) {
          doc.setTextColor(...chips[i].color);
          doc.text(chips[i].text, cursorX, y, { align: 'right' });
          cursorX -= doc.getTextWidth(chips[i].text) + 6;
        }
        y += 9;
      };

      for (const g of grouped) {
        ensureSpace(9 + 6);
        drawCondoBar(g);
        drawTableHeader();

        g.rows.forEach((row, i) => {
          if (y + 6 > pageBottom) {
            doc.addPage();
            drawContinuationHeader();
            drawTableHeader();
          }
          if (i % 2 === 1) {
            doc.setFillColor(...PDF_COLORS.zebra);
            doc.rect(ml - 2, y - 4, 182, 6, 'F');
          }

          doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_COLORS.ink);
          doc.text(row.apt.unit_number, ml + col.apto, y);
          if (row.record) {
            doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_COLORS.mutedLight);
            doc.text(formatMonthLabel(row.record.month), ml + col.ref, y);
          }

          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_COLORS.ink);
          const tenantName = row.tenant ? `${row.tenant.first_name} ${row.tenant.last_name}` : '—';
          doc.text(doc.splitTextToSize(tenantName, inquilinoMaxWidth)[0], ml + col.inquilino, y);

          doc.setFont('helvetica', 'bold');
          doc.text(row.record ? formatCurrency(row.record.rent_value) : '—', ml + col.valor, y, { align: 'right' });
          doc.setFont('helvetica', 'normal');

          doc.setFontSize(7); doc.setTextColor(...PDF_COLORS.muted);
          doc.text(row.record?.payment_date ?? '—', ml + col.pagamento, y, { align: 'center' });

          const owedAmt = row.record ? calcOwed(row.record) : 0;
          doc.setFontSize(7.5);
          if (owedAmt > 0) { doc.setTextColor(...PDF_COLORS.pending); doc.text(formatCurrency(owedAmt), ml + col.devendo, y, { align: 'right' }); }
          else { doc.setTextColor(...PDF_COLORS.mutedLight); doc.text('—', ml + col.devendo, y, { align: 'right' }); }

          const style = statusStyle(row.status);
          if (style) {
            doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
            const textW = doc.getTextWidth(style.label);
            const pillW = textW + 5;
            doc.setFillColor(...style.bg);
            doc.roundedRect(ml + col.status - pillW / 2, y - 3.3, pillW, 4.6, 2, 2, 'F');
            doc.setTextColor(...style.fg);
            doc.text(style.label, ml + col.status, y, { align: 'center' });
            doc.setFont('helvetica', 'normal');
          } else {
            doc.setFontSize(7); doc.setTextColor(...PDF_COLORS.mutedLight);
            doc.text(row.isVacant ? 'Vago' : '—', ml + col.status, y, { align: 'center' });
          }

          y += 6;
        });
        y += 6;
      }

      // ── Rodapé ────────────────────────────────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_COLORS.mutedLight);
        doc.text('Living Gest', ml, 291);
        doc.text(`Página ${p} de ${totalPages}`, pageRight, 291, { align: 'right' });
      }

      doc.save(`Relatorio-${monthLabel}-${selectedYear}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 w-full max-w-[1360px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileBarChart2 className="w-6 h-6 text-primary" />
              Relatório Mensal
            </h1>
            <p className="text-muted-foreground text-sm">Visão completa de todos os apartamentos por mês</p>
          </div>
          <Button onClick={generatePDF} disabled={isLoading || generatingPdf}>
            {(isLoading || generatingPdf) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            {generatingPdf ? 'Gerando...' : 'Baixar PDF'}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-card">
            <p className="text-sm font-semibold text-foreground relative z-10">Recebido</p>
            <p className="text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(grandPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 relative z-10">Pagamentos recebidos no mês</p>
          </div>
          <div className="stat-card">
            <p className="text-sm font-semibold text-foreground relative z-10">A Receber</p>
            <p className="text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(grandPending)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 relative z-10">Vencimento ainda não chegou</p>
          </div>
          <div className="stat-card">
            <p className="text-sm font-semibold text-foreground relative z-10">Inadimplente</p>
            <p className="text-2xl font-bold relative z-10" style={{ color: 'hsl(var(--overdue))' }}>{formatCurrency(grandOverdue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 relative z-10">Venceu e não pagou</p>
          </div>
          <div className="stat-card">
            <p className="text-sm font-semibold text-foreground relative z-10">Devendo</p>
            <p className="text-2xl font-bold relative z-10" style={{ color: grandOwed > 0 ? 'hsl(var(--warning))' : 'hsl(var(--paid))' }}>{formatCurrency(grandOwed)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 relative z-10">Saldo devedor dos pagos</p>
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
                    {g.totalOwed > 0 && <span style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(g.totalOwed)} devendo</span>}
                  </div>
                </div>
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left px-3 py-2">Apto</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Inquilino</th>
                      <th className="text-right px-3 py-2">Valor</th>
                      <th className="text-center px-3 py-2 hidden sm:table-cell">Pagamento</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell" style={{ color: 'hsl(var(--warning))' }}>Devendo</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(row => (
                      <tr key={row.record?.id ?? row.apt.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">
                          {row.apt.unit_number}
                          {row.record && <span className="block text-xs font-normal text-muted-foreground">ref. {formatMonthLabel(row.record.month)}</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {row.tenant ? `${row.tenant.first_name} ${row.tenant.last_name}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {row.record ? formatCurrency(row.record.rent_value) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground hidden sm:table-cell">
                          {row.record?.payment_date ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold hidden sm:table-cell">
                          {row.record && calcOwed(row.record) > 0
                            ? <span style={{ color: 'hsl(var(--warning))' }}>{formatCurrency(calcOwed(row.record))}</span>
                            : <span className="text-muted-foreground">—</span>}
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
