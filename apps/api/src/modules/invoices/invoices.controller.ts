import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { Types } from 'mongoose';
import { InvoiceModel } from './invoice.model';
import { nextInvoiceNumber } from './invoice-counter.model';
import { generateInvoicePDF } from './invoice-pdf.service';
import { ClinicModel } from '../clinics/clinic.model';
import { ClinicSettingsModel } from '../clinics/clinic-settings.model';
import { PatientModel } from '../patients/models/patient.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { parsePagination } from '@api/utils/paginate';
import { sendInvoiceEmail } from '@api/lib/email.service';
import { randomUUID } from 'crypto';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  idParamSchema,
} from './invoices.validation';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

/** Build a Stellar payment URI per SEP-0007 */
function stellarPayURI(destination: string, amount: string, assetCode: string, memo: string): string {
  const params = new URLSearchParams({
    destination,
    amount,
    asset_code: assetCode,
    memo,
    memo_type: 'text',
  });
  return `web+stellar:pay?${params.toString()}`;
}

async function buildQRDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 300, margin: 1 });
}

// POST /invoices
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createInvoiceSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, encounterId, lineItems, dueDate, currency } = req.body;

    const [clinic, settings] = await Promise.all([
      ClinicModel.findById(req.user!.clinicId).lean(),
      ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId }).lean(),
    ]);

    const destination = settings?.stellarPublicKey ?? clinic?.stellarPublicKey;
    if (!destination) {
      return res.status(400).json({ error: 'BadRequest', message: 'Clinic has no Stellar public key configured' });
    }

    const resolvedCurrency: 'XLM' | 'USDC' = currency ?? settings?.currency ?? 'XLM';

    // Compute totals
    const computedItems = (lineItems as { description: string; quantity: number; unitPrice: string }[]).map((item) => ({
      ...item,
      total: (item.quantity * parseFloat(item.unitPrice)).toFixed(7),
    }));
    const subtotal = computedItems.reduce((s, i) => s + parseFloat(i.total), 0).toFixed(7);
    const total = subtotal; // no tax layer for now

    const invoiceNumber = await nextInvoiceNumber(req.user!.clinicId);
    const stellarMemo = invoiceNumber; // use invoice number as memo

    const invoice = await InvoiceModel.create({
      invoiceNumber,
      clinicId: new Types.ObjectId(req.user!.clinicId),
      patientId: new Types.ObjectId(patientId),
      encounterId: encounterId ? new Types.ObjectId(encounterId) : undefined,
      lineItems: computedItems,
      subtotal,
      total,
      currency: resolvedCurrency,
      dueDate: new Date(dueDate),
      stellarMemo,
      stellarDestination: destination,
    });

    return res.status(201).json({ status: 'success', data: invoice });
  }),
);

// GET /invoices
router.get(
  '/',
  validateRequest({ query: listInvoicesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (req.query.patientId) filter.patientId = req.query.patientId;
    if (req.query.status) filter.status = req.query.status;

    const [data, total] = await Promise.all([
      InvoiceModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('patientId', 'firstName lastName systemId')
        .lean(),
      InvoiceModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(total / limit);
    return res.json({
      status: 'success',
      data,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  }),
);

// GET /invoices/:id
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId })
      .populate('patientId', 'firstName lastName systemId')
      .lean();
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const uri = stellarPayURI(invoice.stellarDestination, invoice.total, invoice.currency, invoice.stellarMemo);
    const qrDataUrl = await buildQRDataUrl(uri);

    return res.json({ status: 'success', data: { ...invoice, stellarPayURI: uri, qrCodeDataUrl: qrDataUrl } });
  }),
);

// GET /invoices/:id/pdf
router.get(
  '/:id/pdf',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const [clinic, settings, patient] = await Promise.all([
      ClinicModel.findById(req.user!.clinicId).lean(),
      ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId }).lean(),
      PatientModel.findById(invoice.patientId).lean(),
    ]);

    const uri = stellarPayURI(invoice.stellarDestination, invoice.total, invoice.currency, invoice.stellarMemo);
    const qrDataUrl = await buildQRDataUrl(uri);

    const patientName = patient ? `${(patient as any).firstName} ${(patient as any).lastName}` : 'Unknown';

    const pdfStream = await generateInvoicePDF({
      invoice,
      clinicName: settings?.branding.clinicName || clinic?.name || 'Clinic',
      clinicAddress: settings?.branding.address || clinic?.address || '',
      clinicPhone: settings?.branding.phone || clinic?.phone,
      clinicTaxId: settings?.branding.taxId,
      patientName,
      qrCodeDataUrl: qrDataUrl,
      branding: settings?.branding,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    pdfStream.pipe(res);
  }),
);

// GET /invoices/:id/preview
router.get(
  '/:id/preview',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const [clinic, settings, patient] = await Promise.all([
      ClinicModel.findById(req.user!.clinicId).lean(),
      ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId }).lean(),
      PatientModel.findById(invoice.patientId).lean(),
    ]);

    const uri = stellarPayURI(invoice.stellarDestination, invoice.total, invoice.currency, invoice.stellarMemo);
    const qrDataUrl = await buildQRDataUrl(uri);

    const patientName = patient ? `${(patient as any).firstName} ${(patient as any).lastName}` : 'Unknown';

    const pdfStream = await generateInvoicePDF({
      invoice,
      clinicName: settings?.branding.clinicName || clinic?.name || 'Clinic',
      clinicAddress: settings?.branding.address || clinic?.address || '',
      clinicPhone: settings?.branding.phone || clinic?.phone,
      clinicTaxId: settings?.branding.taxId,
      patientName,
      qrCodeDataUrl: qrDataUrl,
      branding: settings?.branding,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    pdfStream.pipe(res);
  }),
);

// POST /invoices/:id/send — email invoice to patient
router.post(
  '/:id/send',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ error: 'BadRequest', message: 'Cannot send a cancelled invoice' });
    }

    const patient = await PatientModel.findById(invoice.patientId).lean();
    const patientEmail = (patient as any)?.email;
    if (!patientEmail) {
      return res.status(400).json({ error: 'BadRequest', message: 'Patient has no email address on file' });
    }

    const uri = stellarPayURI(invoice.stellarDestination, invoice.total, invoice.currency, invoice.stellarMemo);
    const qrDataUrl = await buildQRDataUrl(uri);

    sendInvoiceEmail(patientEmail, {
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      stellarPayURI: uri,
      qrCodeDataUrl: qrDataUrl,
    });

    if (invoice.status === 'draft') {
      await InvoiceModel.findByIdAndUpdate(invoice._id, { status: 'sent' });
    }

    return res.json({ status: 'success', message: 'Invoice sent' });
  }),
);

const markPaidSchema = z.object({ txHash: z.string().min(1, 'txHash is required') });

// POST /invoices/:id/mark-paid
router.post(
  '/:id/mark-paid',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema, body: markPaidSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { txHash } = req.body;

    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(409).json({ error: 'AlreadyPaid', message: 'Invoice already paid' });

    // Create a linked payment intent record for traceability
    const intentId = randomUUID();
    await PaymentRecordModel.create({
      intentId,
      amount: invoice.total,
      destination: invoice.stellarDestination,
      memo: invoice.stellarMemo,
      clinicId: String(invoice.clinicId),
      patientId: String(invoice.patientId),
      status: 'confirmed',
      assetCode: invoice.currency,
      txHash,
      confirmedAt: new Date(),
    });

    const updated = await InvoiceModel.findByIdAndUpdate(
      invoice._id,
      { status: 'paid', paidAt: new Date(), paidTxHash: txHash, paymentIntentId: intentId },
      { new: true },
    );

    return res.json({ status: 'success', data: updated });
  }),
);

export const invoiceRoutes = router;
