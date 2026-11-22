import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type InvoicePdfData = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  description?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  businessName?: string | null;
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
};

const MARGIN = 14;

/** Plain number with two decimals and an 'Rs.' prefix (no currency symbol, so the default PDF font renders it). */
function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `Rs. ${safe.toFixed(2)}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function downloadInvoicePdf(invoice: InvoicePdfData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - MARGIN;
  let y = 20;

  // Business name (or 'Invoice' when none is set) at the top.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(nonEmpty(invoice.businessName) ?? 'Invoice', MARGIN, y);
  y += 10;

  doc.setFontSize(22);
  doc.text('INVOICE', MARGIN, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Invoice number: ${invoice.invoiceNumber}`, MARGIN, y);
  y += 6;
  doc.text(`Invoice date: ${invoice.invoiceDate}`, MARGIN, y);
  y += 6;
  doc.text(`Due date: ${invoice.dueDate}`, MARGIN, y);
  y += 10;

  // Bill-to block.
  doc.setFont('helvetica', 'bold');
  doc.text('Bill to', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.customerName, MARGIN, y);
  y += 6;
  const email = nonEmpty(invoice.customerEmail);
  if (email) {
    doc.text(email, MARGIN, y);
    y += 6;
  }
  const phone = nonEmpty(invoice.customerPhone);
  if (phone) {
    doc.text(phone, MARGIN, y);
    y += 6;
  }
  y += 4;

  // Line items.
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: invoice.items.map((item) => [
      item.description,
      String(item.quantity),
      formatMoney(item.unitPrice),
      formatMoney(item.lineTotal),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (lastTable?.finalY ?? y) + 10;

  // Totals. Balance due is never negative.
  const balanceDue = Math.max(0, Math.round((invoice.totalAmount - invoice.paidAmount) * 100) / 100);
  const totals: [string, string][] = [
    ['Subtotal', formatMoney(invoice.subtotal)],
    ['Total', formatMoney(invoice.totalAmount)],
    ['Paid', formatMoney(invoice.paidAmount)],
    ['Balance due', formatMoney(balanceDue)],
  ];
  doc.setFontSize(10);
  for (const [label, value] of totals) {
    const isBalance = label === 'Balance due';
    doc.setFont('helvetica', isBalance ? 'bold' : 'normal');
    doc.text(label, rightX - 45, y);
    doc.text(value, rightX, y, { align: 'right' });
    y += 6;
  }

  const notes = nonEmpty(invoice.description);
  if (notes) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(notes, pageWidth - MARGIN * 2) as string[];
    doc.text(lines, MARGIN, y);
  }

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
