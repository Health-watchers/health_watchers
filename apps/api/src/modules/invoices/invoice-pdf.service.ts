import axios from 'axios';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { IInvoice } from './invoice.model';
import { downloadFile } from '../documents/storage.service';

interface InvoiceBranding {
  logoUrl?: string;
  logoStorageKey?: string;
  primaryColor?: string;
  address?: string;
  phone?: string;
  taxId?: string;
  headerText?: string;
  footerText?: string;
  signatureName?: string;
  signatureTitle?: string;
  signatureUrl?: string;
  signatureStorageKey?: string;
}

interface InvoicePDFOptions {
  invoice: IInvoice;
  clinicName: string;
  clinicAddress: string;
  clinicPhone?: string;
  clinicTaxId?: string;
  patientName: string;
  qrCodeDataUrl: string; // base64 PNG data URL
  branding?: InvoiceBranding;
}

async function fetchLogoBuffer(branding: InvoiceBranding): Promise<Buffer | null> {
  if (branding.logoStorageKey) {
    try {
      return await downloadFile(branding.logoStorageKey);
    } catch {
      return null;
    }
  }

  if (branding.logoUrl) {
    // data URL (base64 embedded)
    if (/^data:image\//i.test(branding.logoUrl)) {
      try {
        const base = branding.logoUrl.replace(/^data:image\/[^;]+;base64,/, '');
        return Buffer.from(base, 'base64');
      } catch {
        return null;
      }
    }

    const isAbsoluteUrl = /^https?:\/\//i.test(branding.logoUrl);
    if (isAbsoluteUrl) {
      try {
        const response = await axios.get<ArrayBuffer>(branding.logoUrl, {
          responseType: 'arraybuffer',
          timeout: 5000,
        });
        return Buffer.from(response.data);
      } catch {
        return null;
      }
    }

    const localMatch = branding.logoUrl.match(/\/api\/v1\/documents\/_local\/(.+)$/);
    if (localMatch?.[1]) {
      try {
        return await downloadFile(decodeURIComponent(localMatch[1]));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function generateInvoicePDF(opts: InvoicePDFOptions): Promise<PassThrough> {
  const {
    invoice,
    clinicName,
    clinicAddress,
    clinicPhone,
    clinicTaxId,
    patientName,
    qrCodeDataUrl,
    branding = {},
  } = opts;

  const primaryColor = branding.primaryColor ?? '#2563eb';
  const resolvedAddress = branding.address?.trim() || clinicAddress || '';
  const resolvedPhone = branding.phone?.trim() || clinicPhone || '';
  const resolvedTaxId = branding.taxId?.trim() || clinicTaxId || '';
  const headerText = branding.headerText?.trim();
  const footerText = branding.footerText?.trim();
  const signatureName = branding.signatureName?.trim();
  const signatureTitle = branding.signatureTitle?.trim();

  const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 90, left: 50, right: 50 } });
  const stream = new PassThrough();
  doc.pipe(stream);

  const logoX = 50;
  const logoY = 50;
  const logoBuffer = await fetchLogoBuffer(branding);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, logoX, logoY, { fit: [120, 60], align: 'left' });
    } catch {
      // swallow invalid logo image
    }
  }

  const titleX = branding.logoUrl || branding.logoStorageKey ? 180 : logoX;
  doc.fontSize(22).fillColor(primaryColor).text(clinicName, titleX, logoY, {
    width: 300,
    continued: false,
  });

  doc.fontSize(9).fillColor('#444');
  if (resolvedAddress) doc.text(resolvedAddress, titleX, doc.y + 4, { width: 300 });
  if (resolvedPhone) doc.text(`Phone: ${resolvedPhone}`, { width: 300 });
  if (resolvedTaxId) doc.text(`Tax ID: ${resolvedTaxId}`, { width: 300 });
  doc.fillColor('#000');

  doc.fontSize(28).fillColor('#111').text('INVOICE', { align: 'right', lineGap: 2 });
  doc.fontSize(10).text(`#${invoice.invoiceNumber}`, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
  doc.text(`Due: ${invoice.dueDate.toLocaleDateString()}`, { align: 'right' });
  doc.moveDown(1);

  if (headerText) {
    doc.fontSize(10).fillColor(primaryColor).text(headerText, { align: 'center' });
    doc.moveDown(1);
  }

  doc.fontSize(11).fillColor('#111').text('Bill To:', { underline: true });
  doc.fontSize(10).fillColor('#000').text(patientName);
  doc.moveDown(1);

  const colX = [50, 310, 395, 470];
  doc.fontSize(10).fillColor('#fff').rect(50, doc.y, 485, 20).fill(primaryColor);
  const headerY2 = doc.y - 16;
  doc.fillColor('#fff')
    .text('Description', colX[0], headerY2)
    .text('Qty', colX[1], headerY2, { width: 60, align: 'right' })
    .text('Unit Price', colX[2], headerY2, { width: 80, align: 'right' })
    .text('Total', colX[3], headerY2, { width: 80, align: 'right' });
  doc.fillColor('#000');
  doc.moveDown(0.8);

  invoice.lineItems.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 0) {
      doc.rect(50, rowY - 2, 485, 18).fill('#f7f9fc').fillColor('#000');
    }
    doc.fontSize(9)
      .text(item.description, colX[0], rowY, { width: 260 })
      .text(String(item.quantity), colX[1], rowY, { width: 60, align: 'right' })
      .text(`${item.unitPrice} ${invoice.currency}`, colX[2], rowY, { width: 80, align: 'right' })
      .text(`${item.total} ${invoice.currency}`, colX[3], rowY, { width: 80, align: 'right' });
    doc.moveDown(0.8);
  });

  doc.moveDown(0.5);
  const separatorY = doc.y;
  doc.strokeColor('#ddd').lineWidth(0.5).moveTo(50, separatorY).lineTo(535, separatorY).stroke();
  doc.moveDown(0.6);

  doc.fontSize(10)
    .text('Subtotal:', 350, doc.y, { width: 120, align: 'right' })
    .text(`${invoice.subtotal} ${invoice.currency}`, 470, doc.y, { width: 80, align: 'right' });
  doc.moveDown(0.4);
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Total:', 350, doc.y, { width: 120, align: 'right' })
    .text(`${invoice.total} ${invoice.currency}`, 470, doc.y, { width: 80, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(1.5);

  doc.fontSize(11).fillColor('#111').text('Stellar Payment Details', { underline: true });
  doc.fontSize(9).fillColor('#444');
  doc.text(`Destination: ${invoice.stellarDestination}`);
  doc.text(`Amount: ${invoice.total} ${invoice.currency}`);
  doc.text(`Memo: ${invoice.stellarMemo}`);
  doc.fillColor('#000');
  doc.moveDown(1);

  if (qrCodeDataUrl) {
    const imgBuffer = Buffer.from(qrCodeDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    doc.fontSize(10).fillColor('#111').text('Scan to pay:', { align: 'center' });
    doc.image(imgBuffer, (doc.page.width - 120) / 2, doc.y, { fit: [120, 120], align: 'center' });
    doc.moveDown(1.2);
  }

  if (signatureName || signatureTitle) {
    // Try to render a signature image if provided, otherwise fall back to printed name/title
    const signatureBuffer = await (async function fetchSignatureBuffer(): Promise<Buffer | null> {
      if (branding.signatureStorageKey) {
        try {
          return await downloadFile(branding.signatureStorageKey);
        } catch {
          return null;
        }
      }
      if (branding.signatureUrl) {
        if (/^data:image\//i.test(branding.signatureUrl)) {
          try {
            const base = branding.signatureUrl.replace(/^data:image\/[^;]+;base64,/, '');
            return Buffer.from(base, 'base64');
          } catch {
            return null;
          }
        }
        const isAbsolute = /^https?:\/\//i.test(branding.signatureUrl);
        if (isAbsolute) {
          try {
            const r = await axios.get<ArrayBuffer>(branding.signatureUrl, { responseType: 'arraybuffer', timeout: 5000 });
            return Buffer.from(r.data);
          } catch {
            return null;
          }
        }
        const localMatch = branding.signatureUrl.match(/\/api\/v1\/documents\/_local\/(.+)$/);
        if (localMatch?.[1]) {
          try {
            return await downloadFile(decodeURIComponent(localMatch[1]));
          } catch {
            return null;
          }
        }
      }
      return null;
    })();

    doc.moveDown(1);
    doc.fontSize(10).fillColor('#111').text('Authorized signature:', { underline: true });
    doc.moveDown(0.6);
    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, { fit: [200, 80] });
        doc.moveDown(0.6);
      } catch {
        // ignore image errors and fall back to text
      }
    }
    if (signatureName) {
      doc.font('Helvetica-Bold').text(signatureName);
    }
    if (signatureTitle) {
      doc.font('Helvetica').text(signatureTitle);
    }
    doc.moveDown(1);
  }

  const footerY = doc.page.height - 60;
  const footerLines: string[] = [];
  if (footerText) footerLines.push(footerText);
  if (!footerText) {
    const contactParts = [clinicName, resolvedAddress, resolvedPhone ? `Phone: ${resolvedPhone}` : undefined, resolvedTaxId ? `Tax ID: ${resolvedTaxId}` : undefined].filter(Boolean);
    footerLines.push(contactParts.join(' • '));
  }
  doc.fontSize(8).fillColor('#888').text(footerLines.join(' | '), 50, footerY, {
    width: doc.page.width - 100,
    align: 'center',
  });

  doc.end();
  return stream;
}
