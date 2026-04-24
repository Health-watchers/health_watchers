import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { IInvoice } from './invoice.model';

interface InvoicePDFOptions {
  invoice: IInvoice;
  clinicName: string;
  clinicAddress: string;
  patientName: string;
  qrCodeDataUrl: string; // base64 PNG data URL
}

export function generateInvoicePDF(opts: InvoicePDFOptions): PassThrough {
  const { invoice, clinicName, clinicAddress, patientName, qrCodeDataUrl } = opts;

  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
  const stream = new PassThrough();
  doc.pipe(stream);

  // ── Header ────────────────────────────────────────────────────────────────
  doc.fontSize(20).text(clinicName, { align: 'left' });
  doc.fontSize(9).fillColor('#666').text(clinicAddress, { align: 'left' });
  doc.fillColor('#000');

  doc.fontSize(28).text('INVOICE', { align: 'right' });
  doc.moveUp(2);
  doc.fontSize(10).text(`#${invoice.invoiceNumber}`, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
  doc.text(`Due: ${invoice.dueDate.toLocaleDateString()}`, { align: 'right' });
  doc.moveDown(2);

  // ── Bill To ───────────────────────────────────────────────────────────────
  doc.fontSize(11).text('Bill To:', { underline: true });
  doc.fontSize(10).text(patientName);
  doc.moveDown(1.5);

  // ── Line Items Table ──────────────────────────────────────────────────────
  const colX = [50, 280, 360, 430, 500];
  doc.fontSize(10).fillColor('#fff')
    .rect(50, doc.y, 495, 18).fill('#2563eb');
  const headerY = doc.y - 14;
  doc.fillColor('#fff')
    .text('Description', colX[0], headerY)
    .text('Qty',         colX[1], headerY, { width: 60, align: 'right' })
    .text('Unit Price',  colX[2], headerY, { width: 60, align: 'right' })
    .text('Total',       colX[3], headerY, { width: 60, align: 'right' });
  doc.fillColor('#000');
  doc.moveDown(0.3);

  invoice.lineItems.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 0) doc.rect(50, rowY - 2, 495, 16).fill('#f8fafc').fillColor('#000');
    doc.fontSize(9)
      .text(item.description,       colX[0], rowY, { width: 220 })
      .text(String(item.quantity),  colX[1], rowY, { width: 60, align: 'right' })
      .text(`${item.unitPrice} ${invoice.currency}`, colX[2], rowY, { width: 60, align: 'right' })
      .text(`${item.total} ${invoice.currency}`,     colX[3], rowY, { width: 60, align: 'right' });
    doc.moveDown(0.8);
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  doc.moveDown(0.5);
  doc.moveTo(350, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);
  doc.fontSize(10)
    .text('Subtotal:', 350, doc.y, { width: 100, align: 'right' })
    .text(`${invoice.subtotal} ${invoice.currency}`, 460, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Total:', 350, doc.y, { width: 100, align: 'right' })
    .text(`${invoice.total} ${invoice.currency}`, 460, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(2);

  // ── Stellar Payment Details ───────────────────────────────────────────────
  doc.fontSize(11).text('Stellar Payment Details', { underline: true });
  doc.fontSize(9).fillColor('#444');
  doc.text(`Destination: ${invoice.stellarDestination}`);
  doc.text(`Amount: ${invoice.total} ${invoice.currency}`);
  doc.text(`Memo: ${invoice.stellarMemo}`);
  doc.fillColor('#000');
  doc.moveDown(1);

  // ── QR Code ───────────────────────────────────────────────────────────────
  if (qrCodeDataUrl) {
    const imgBuffer = Buffer.from(qrCodeDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    doc.text('Scan to pay:', { align: 'center' });
    doc.image(imgBuffer, { fit: [120, 120], align: 'center' });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor('#999')
    .text(`Status: ${invoice.status.toUpperCase()}`, 50, doc.page.height - 50, { align: 'center' });

  doc.end();
  return stream;
}
