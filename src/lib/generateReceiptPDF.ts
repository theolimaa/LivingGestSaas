import jsPDF from 'jspdf';
import { formatCurrency, formatDate, getPeriodAndDueDate } from '@/lib/utils-app';
import { FinancialRecordDB, calcReceived, calcOwed } from '@/hooks/useFinancial';

export interface ReceiptPDFInput {
  record: FinancialRecordDB;
  apartmentUnit: string;
  condominiumName: string;
  tenantFirstName: string;
  tenantLastName: string;
  tenantCpf?: string | null;
  contractPaymentDay?: number | null;
  contractStartDate?: string | null;
  contractCautionPaid?: boolean | null;
  contractCautionValue?: number | null;
  contractCautionDate?: string | null;
  allYearRecords: FinancialRecordDB[];
  adminName: string;
  today?: string;
  debtNotice?: boolean;
  totalOwed?: number;
  contractEndDate?: string | null; // para ajustar o último período ao dia real de saída
}

export function generateReceiptCode(
  condominiumName: string,
  unitNumber: string,
  contractStartDate?: string | null
): string {
  const sigla = condominiumName
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  const parts = unitNumber.split('-');
  const numIndicativo = parts.length >= 2 ? parts[0] : '';
  const apNum =
    parts.length >= 2
      ? parts[1].padStart(2, '0')
      : unitNumber.padStart(2, '0');
  let dateStr = '';
  if (contractStartDate) {
    const d = new Date(contractStartDate + 'T12:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    dateStr = `${dd}${mm}${d.getFullYear()}`;
  }
  return `${sigla}${numIndicativo}AP${apNum}${dateStr}`;
}

export function getPeriodLabel(month: string, paymentDay: number): string {
  const [y, m] = month.split('-').map(Number);
  const startDay = String(paymentDay).padStart(2, '0');
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${startDay}/${String(m).padStart(2, '0')}/${y} a ${startDay}/${String(
    nextM
  ).padStart(2, '0')}/${nextY}`;
}

export function buildReceiptPDF(input: ReceiptPDFInput): Uint8Array {
  const {
    record,
    apartmentUnit,
    condominiumName,
    tenantFirstName,
    tenantLastName,
    tenantCpf,
    contractPaymentDay,
    contractStartDate,
    contractCautionPaid,
    contractCautionValue,
    contractCautionDate,
    allYearRecords,
    adminName,
    debtNotice = false,
    totalOwed: totalOwedParam,
    contractEndDate,
  } = input;

  const paymentDay = contractPaymentDay ?? 1;
  const receiptCode = generateReceiptCode(
    condominiumName,
    apartmentUnit,
    contractStartDate
  );

  const today =
    input.today ??
    new Date().toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const [recYear] = record.month.split('-').map(Number);
  const yearRecords = allYearRecords
    .filter(
      r =>
        r.month.startsWith(String(recYear)) && r.month <= record.month
    )
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, 12);

  const { periodLabel: rawPeriodLabel } = getPeriodAndDueDate(record.month, contractStartDate ?? null, paymentDay);
  // Ajusta o último período de contrato encerrado: substitui fim pelo dia real de saída
  function applyEndDate(label: string, month: string): string {
    if (!contractEndDate) return label;
    const [py, pm] = month.split('-').map(Number);
    const endM = pm === 12 ? 1 : pm + 1;
    const endY = pm === 12 ? py + 1 : py;
    const periodEndMonth = `${endY}-${String(endM).padStart(2,'0')}`;
    const contractEndMonth = contractEndDate.substring(0, 7);
    if (periodEndMonth === contractEndMonth || month === contractEndMonth) {
      const ed = new Date(contractEndDate + 'T12:00:00');
      const edStr = `${String(ed.getDate()).padStart(2,'0')}/${String(ed.getMonth()+1).padStart(2,'0')}/${ed.getFullYear()}`;
      const parts = label.split(' a ');
      if (parts.length === 2) return `${parts[0]} a ${edStr}`;
    }
    return label;
  }
  const periodLabel = applyEndDate(rawPeriodLabel, record.month);
  const receivedAmt = calcReceived(record);
  const owedAmt = calcOwed(record);
  const paidFormatted = formatCurrency(receivedAmt > 0 ? receivedAmt : record.rent_value);
  const methodLabel = record.payment_method === 'pix' ? ' Forma de pagamento: Pix.' : record.payment_method === 'especie' ? ' Forma de pagamento: Espécie.' : '';

  const prefix = (debtNotice && !record.paid) ? 'AVISO DE COBRANÇA' : 'RECIBO';
  const title = `${prefix} — APTO ${apartmentUnit} — ${tenantFirstName} ${tenantLastName} — ${today}`;
  let mainText: string;
  if (debtNotice && !record.paid) {
    mainText = `Aviso de cobrança para ${tenantFirstName} ${tenantLastName}, CPF ${
      tenantCpf || '—'
    }. Referente ao aluguel do período ${periodLabel}, no valor de ${formatCurrency(record.rent_value)}, que consta em aberto.`;
    if (totalOwedParam && totalOwedParam > record.rent_value) {
      mainText += ` Total em débito: ${formatCurrency(totalOwedParam)}.`;
    }
  } else {
    mainText = `Recebi de ${tenantFirstName} ${tenantLastName}, CPF ${
      tenantCpf || '—'
    } a importância de: ${paidFormatted} referente ao aluguel para o período de ${periodLabel}.`;
    if (record.paid && methodLabel) mainText += methodLabel;
    if (owedAmt > 0) mainText += ` Saldo devedor: ${formatCurrency(owedAmt)}.`;
  }
  if (record.observations) mainText += ` Obs: ${record.observations}.`;
  const cautionLine =
    contractCautionPaid && contractCautionValue
      ? `Caução paga no valor de ${formatCurrency(contractCautionValue)}${
          contractCautionDate
            ? ` na data ${formatDate(contractCautionDate)}`
            : ''
        }.`
      : '';
  const historyTitle = `Histórico do Ano ${recYear}`;
  const footer = `Fortaleza, ${today} — ${adminName} — Confira seu recibo.`;

  const doc = new jsPDF();
  const ml = 20;
  let y = 20;

  const addText = (text: string, fontSize = 10, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, ml, y);
    y += lines.length * (fontSize * 0.45) + 2;
  };

  const addLine = () => {
    doc.setDrawColor(200, 200, 200);
    doc.line(ml, y, 190, y);
    y += 4;
  };

  addText(receiptCode, 11, true);
  addText(title, 11, true);
  addLine();
  y += 2;
  addText(mainText, 10);
  if (cautionLine) {
    y += 2;
    addText(cautionLine, 10);
  }
  y += 4;
  addLine();
  addText(historyTitle, 11, true);
  y += 2;

  const cols = {
    periodo: 20,
    valor: 85,
    forma: 110,
    pagamento: 130,
    pago: 155,
    devendo: 178,
  };
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Período', cols.periodo, y);
  doc.text('Valor', cols.valor, y);
  doc.text('Forma', cols.forma, y);
  doc.text('Data Pag.', cols.pagamento, y);
  doc.text('Pago', cols.pago, y);
  doc.text('Devendo', cols.devendo, y);
  y += 5;

  let totalPaid = 0;
  let totalOwed = 0;
  doc.setFont('helvetica', 'normal');
  yearRecords.forEach(r => {
    const { periodLabel: rawPLabel } = getPeriodAndDueDate(r.month, contractStartDate ?? null, paymentDay);
    const pLabel = applyEndDate(rawPLabel, r.month);
    const received = calcReceived(r);
    const owed = r.paid ? calcOwed(r) : r.rent_value; // não pagos = devendo o valor todo
    totalPaid += received;
    totalOwed += owed;
    const methodStr = r.payment_method === 'pix' ? 'Pix' : r.payment_method === 'especie' ? 'Espécie' : '—';
    doc.text(doc.splitTextToSize(pLabel, 60)[0], cols.periodo, y);
    doc.text(formatCurrency(r.rent_value), cols.valor, y);
    doc.text(r.paid ? methodStr : '—', cols.forma, y);
    doc.text(r.payment_date ? formatDate(r.payment_date) : '—', cols.pagamento, y);
    if (r.paid) doc.setTextColor(34, 197, 94);
    doc.text(received > 0 ? formatCurrency(received) : '—', cols.pago, y);
    doc.setTextColor(0, 0, 0);
    if (owed > 0) doc.setTextColor(239, 68, 68);
    doc.text(owed > 0 ? formatCurrency(owed) : '—', cols.devendo, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  });

  addLine();
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Pago: ${formatCurrency(totalPaid)}`, cols.pago - 15, y);
  doc.text(`Devendo: ${formatCurrency(totalOwed)}`, cols.devendo - 5, y);
  y += 10;
  addLine();
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(footer, ml, y);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

export interface DebtAgreementReceiptParams {
  agreement: {
    id: string;
    original_amount: number;
    agreed_amount: number;
    installment_count: number;
    installment_value: number;
    notes: string | null;
    status: string;
  };
  installments: Array<{
    installment_number: number;
    amount: number;
    due_date: string | null;
    paid: boolean;
    payment_date: string | null;
    payment_method: string | null;
  }>;
  tenantFirstName: string;
  tenantLastName: string;
  tenantCpf: string | null;
  apartmentUnit: string;
  condominiumName: string;
  adminName: string;
  // Se quisermos gerar recibo de uma parcela específica
  highlightInstallment?: number;
}

export function buildDebtAgreementReceiptPDF(p: DebtAgreementReceiptParams): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ml = 20; // margin left
  const pw = 170; // page width content
  const today = formatDate(new Date().toISOString().split('T')[0]);

  const paidInstallments = p.installments.filter(i => i.paid);
  const paidTotal = paidInstallments.reduce((s, i) => s + i.amount, 0);
  const remaining = p.agreement.agreed_amount - paidTotal;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const code = `DA${p.apartmentUnit.replace(/[^A-Z0-9]/gi, '')}${String(p.agreement.installment_count).padStart(2,'0')}${today.replace(/\//g,'')}`;
  doc.text(code, ml, 15);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  const title = p.highlightInstallment
    ? `RECIBO DE ACORDO — PARCELA ${p.highlightInstallment}/${p.agreement.installment_count} — APTO ${p.apartmentUnit}`
    : `ACORDO DE DÍVIDA — APTO ${p.apartmentUnit} — ${p.tenantFirstName} ${p.tenantLastName}`;
  const titleLines = doc.splitTextToSize(title, pw);
  doc.text(titleLines, ml, 22);
  let y = 22 + titleLines.length * 6 + 4;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`${p.condominiumName} · Emitido em ${today}`, ml, y);
  y += 8;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(ml, y, ml + pw, y);
  y += 6;

  // Main text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  let mainText: string;
  if (p.highlightInstallment) {
    const inst = p.installments.find(i => i.installment_number === p.highlightInstallment);
    const method = inst?.payment_method === 'pix' ? 'Pix' : inst?.payment_method === 'especie' ? 'Espécie' : '';
    mainText = `Recebi de ${p.tenantFirstName} ${p.tenantLastName}, CPF ${p.tenantCpf || '—'}, a importância de ${formatCurrency(inst?.amount ?? p.agreement.installment_value)} referente à parcela ${p.highlightInstallment}/${p.agreement.installment_count} do acordo de dívida do apartamento ${p.apartmentUnit}.`;
    if (method && inst?.payment_date) mainText += ` Pago via ${method} em ${formatDate(inst.payment_date)}.`;
    if (remaining > 0) mainText += ` Saldo restante do acordo: ${formatCurrency(remaining)}.`;
  } else {
    mainText = `Aviso de acordo de dívida para ${p.tenantFirstName} ${p.tenantLastName}, CPF ${p.tenantCpf || '—'}. Dívida original: ${formatCurrency(p.agreement.original_amount)}. Valor acordado: ${formatCurrency(p.agreement.agreed_amount)} em ${p.agreement.installment_count} parcelas de ${formatCurrency(p.agreement.installment_value)}.`;
    if (p.agreement.notes) mainText += ` Obs: ${p.agreement.notes}.`;
    if (remaining > 0) mainText += ` Saldo em aberto: ${formatCurrency(remaining)}.`;
  }
  const mainLines = doc.splitTextToSize(mainText, pw);
  doc.text(mainLines, ml, y);
  y += mainLines.length * 5 + 8;

  // Divider
  doc.line(ml, y, ml + pw, y);
  y += 6;

  // Installments table
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Parcelas do Acordo', ml, y);
  y += 5;

  // Header
  doc.setFontSize(8);
  doc.setFillColor(240, 240, 240);
  doc.rect(ml, y, pw, 5, 'F');
  doc.setTextColor(80, 80, 80);
  doc.text('#', ml + 2, y + 3.5);
  doc.text('Valor', ml + 15, y + 3.5);
  doc.text('Vencimento', ml + 45, y + 3.5);
  doc.text('Forma', ml + 85, y + 3.5);
  doc.text('Pagamento', ml + 115, y + 3.5);
  doc.text('Status', ml + 148, y + 3.5);
  y += 7;

  doc.setFont('helvetica', 'normal');
  p.installments.forEach(inst => {
    const isHighlight = inst.installment_number === p.highlightInstallment;
    if (isHighlight) {
      doc.setFillColor(254, 249, 231);
      doc.rect(ml, y - 1, pw, 5.5, 'F');
    }
    doc.setTextColor(30, 30, 30);
    doc.text(String(inst.installment_number), ml + 2, y + 3);
    doc.text(formatCurrency(inst.amount), ml + 15, y + 3);
    doc.text(inst.due_date ? formatDate(inst.due_date) : '—', ml + 45, y + 3);
    const method = inst.payment_method === 'pix' ? 'Pix' : inst.payment_method === 'especie' ? 'Espécie' : '—';
    doc.text(inst.paid ? method : '—', ml + 85, y + 3);
    doc.text(inst.payment_date ? formatDate(inst.payment_date) : '—', ml + 115, y + 3);
    if (inst.paid) { doc.setTextColor(34, 197, 94); doc.text('Pago', ml + 148, y + 3); }
    else { doc.setTextColor(239, 68, 68); doc.text('Em aberto', ml + 148, y + 3); }
    doc.setTextColor(30, 30, 30);
    y += 5.5;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(ml, y, ml + pw, y);
  y += 5;

  // Summary
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94);
  doc.text(`Total pago: ${formatCurrency(paidTotal)}`, ml + pw - 70, y);
  if (remaining > 0) {
    doc.setTextColor(239, 68, 68);
    doc.text(`Em aberto: ${formatCurrency(remaining)}`, ml + pw - 70, y + 5);
    y += 5;
  }
  y += 10;

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Fortaleza, ${today} — ${p.adminName} — Documento de acordo de dívida.`, ml, y);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
