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

  const { periodLabel } = getPeriodAndDueDate(record.month, contractStartDate ?? null, paymentDay);
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
    if (totalOwed && totalOwed > record.rent_value) {
      mainText += ` Total em débito: ${formatCurrency(totalOwed)}.`;
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
    const { periodLabel: pLabel } = getPeriodAndDueDate(r.month, contractStartDate ?? null, paymentDay);
    const received = calcReceived(r);
    const owed = calcOwed(r);
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
