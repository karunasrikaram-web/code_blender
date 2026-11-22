import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../utils/format';
import fontUrl from '../assets/fonts/NotoSans-Regular.ttf?url';

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

const PDF_FONT_NAME = 'NotoSans';
const PDF_FONT_FILE = 'NotoSans-Regular.ttf';

// Cached so the font is fetched and encoded once per session.
let fontBase64Promise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function loadInvoiceFont(): Promise<string> {
  if (!fontBase64Promise) {
    fontBase64Promise = fetch(fontUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load PDF font: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(arrayBufferToBase64);
  }
  return fontBase64Promise;
}

/**
 * INR amount for the PDF, e.g. 125000 -> "₹1,25,000.00". The embedded Noto Sans font
 * supplies the ₹ glyph, which the default Helvetica font cannot render.
 */
export function formatMoney(value: number): string {
  return formatCurrency(value);
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function downloadInvoicePdf(invoice: InvoicePdfData): Promise<void> {
  const fontBase64 = await loadInvoiceFont();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS(PDF_FONT_FILE, fontBase64);
  doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'normal');
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
    styles: { font: PDF_FONT_NAME },
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
    doc.setFont(PDF_FONT_NAME, 'normal');
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
