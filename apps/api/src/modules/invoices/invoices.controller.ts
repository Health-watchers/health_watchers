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
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { paginate, parsePagination } from '@api/utils/paginate';
import { sendInvoiceEmail } from '@api/lib/email.service';
import { randomUUID } from 'crypto';
import { createInvoiceSchema, listInvoicesQuerySchema, idParamSchema } from './invoices.validation';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

/** Build a Stellar payment URI per SEP-0007 */
function stellarPayURI(
  destination: string,
  amount: string,
  assetCode: string,
  memo: string
): string {
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

/**
 * @swagger
 * /invoices:
 *   post:
 *     summary: Create an invoice for a patient with a Stellar payment memo/destination
 *     description: Computes line item and subtotal/total amounts server-side. The clinic must have a Stellar public key configured (via clinic settings or clinic record) before invoices can be created.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, lineItems, dueDate]
 *             properties:
 *               patientId: { type: string, description: 'Patient MongoDB ObjectId' }
 *               encounterId: { type: string, description: 'Optional linked encounter ObjectId' }
 *               lineItems:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [description, quantity, unitPrice]
 *                   properties:
 *                     description: { type: string, maxLength: 500, example: 'Consultation fee' }
 *                     quantity: { type: integer, minimum: 1, example: 1 }
 *                     unitPrice: { type: string, example: '25.0000000', description: 'Positive numeric string, up to 7 decimal places' }
 *               dueDate: { type: string, format: date-time }
 *               currency: { type: string, enum: [XLM, USDC], description: 'Defaults to clinic settings currency, then XLM' }
 *     responses:
 *       201:
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: '507f1f77bcf86cd799439050' }
 *                     invoiceNumber: { type: string, example: 'INV-000123' }
 *                     clinicId: { type: string }
 *                     patientId: { type: string }
 *                     encounterId: { type: string, nullable: true }
 *                     lineItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           description: { type: string }
 *                           quantity: { type: integer }
 *                           unitPrice: { type: string }
 *                           total: { type: string }
 *                     subtotal: { type: string, example: '25.0000000' }
 *                     total: { type: string, example: '25.0000000' }
 *                     currency: { type: string, enum: [XLM, USDC] }
 *                     status: { type: string, enum: [draft, sent, paid, cancelled], example: draft }
 *                     dueDate: { type: string, format: date-time }
 *                     stellarMemo: { type: string }
 *                     stellarDestination: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error, or clinic has no Stellar public key configured
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Clinic has no Stellar public key configured' });
    }

    const resolvedCurrency: 'XLM' | 'USDC' = currency ?? settings?.currency ?? 'XLM';

    // Compute totals
    const computedItems = (
      lineItems as { description: string; quantity: number; unitPrice: string }[]
    ).map((item) => ({
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
  })
);

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: List invoices for the caller's clinic
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *         description: Filter by patient MongoDB ObjectId
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, paid, overdue, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated list of invoices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       invoiceNumber: { type: string, example: 'INV-000123' }
 *                       clinicId: { type: string }
 *                       patientId: { type: string }
 *                       encounterId: { type: string, nullable: true }
 *                       lineItems:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             description: { type: string }
 *                             quantity: { type: integer }
 *                             unitPrice: { type: string }
 *                             total: { type: string }
 *                       subtotal: { type: string }
 *                       total: { type: string }
 *                       currency: { type: string, enum: [XLM, USDC] }
 *                       status: { type: string, enum: [draft, sent, paid, cancelled] }
 *                       dueDate: { type: string, format: date-time }
 *                       createdAt: { type: string, format: date-time }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/',
  validateRequest({ query: listInvoicesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (req.query.patientId) filter.patientId = req.query.patientId;
    if (req.query.status) filter.status = req.query.status;

    const result = await paginate(InvoiceModel, filter, page, limit, { createdAt: -1 });
    return res.json({
      status: 'success',
      data: result.data,
      pagination: result.meta,
    });
  })
);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get a single invoice, including its Stellar payment URI and QR code
 *     description: The `stellarPayURI` follows SEP-0007 (web+stellar:pay?...) and `qrCodeDataUrl` is a base64 PNG data URL encoding that URI, ready to render directly in an <img> tag.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Invoice MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Invoice details with payment URI and QR code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     invoiceNumber: { type: string, example: 'INV-000123' }
 *                     clinicId: { type: string }
 *                     patientId:
 *                       type: object
 *                       description: Populated with firstName, lastName, systemId
 *                       properties:
 *                         _id: { type: string }
 *                         firstName: { type: string }
 *                         lastName: { type: string }
 *                         systemId: { type: string }
 *                     lineItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           description: { type: string }
 *                           quantity: { type: integer }
 *                           unitPrice: { type: string }
 *                           total: { type: string }
 *                     subtotal: { type: string }
 *                     total: { type: string }
 *                     currency: { type: string, enum: [XLM, USDC] }
 *                     status: { type: string, enum: [draft, sent, paid, cancelled] }
 *                     dueDate: { type: string, format: date-time }
 *                     stellarMemo: { type: string }
 *                     stellarDestination: { type: string }
 *                     stellarPayURI: { type: string, example: 'web+stellar:pay?destination=G...&amount=25.0000000&asset_code=XLM&memo=INV-000123&memo_type=text' }
 *                     qrCodeDataUrl: { type: string, example: 'data:image/png;base64,iVBORw0KG...' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Invoice not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId })
      .populate('patientId', 'firstName lastName systemId')
      .lean();
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const uri = stellarPayURI(
      invoice.stellarDestination,
      invoice.total,
      invoice.currency,
      invoice.stellarMemo
    );
    const qrDataUrl = await buildQRDataUrl(uri);

    return res.json({
      status: 'success',
      data: { ...invoice, stellarPayURI: uri, qrCodeDataUrl: qrDataUrl },
    });
  })
);

/**
 * @swagger
 * /invoices/{id}/pdf:
 *   get:
 *     summary: Download the invoice as a PDF attachment
 *     description: Streams a generated PDF with Content-Disposition attachment, prompting a download in browsers.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Invoice MongoDB ObjectId
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Invoice not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/:id/pdf',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const [clinic, settings, patient] = await Promise.all([
      ClinicModel.findById(req.user!.clinicId).lean(),
      ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId }).lean(),
      PatientModel.findById(invoice.patientId).lean(),
    ]);

    const uri = stellarPayURI(
      invoice.stellarDestination,
      invoice.total,
      invoice.currency,
      invoice.stellarMemo
    );
    const qrDataUrl = await buildQRDataUrl(uri);

    const patientName = patient
      ? `${(patient as any).firstName} ${(patient as any).lastName}`
      : 'Unknown';

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
  })
);

/**
 * @swagger
 * /invoices/{id}/preview:
 *   get:
 *     summary: Preview the invoice PDF inline in the browser
 *     description: Same PDF as GET /invoices/{id}/pdf but with Content-Disposition inline, so browsers render it rather than downloading it.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Invoice MongoDB ObjectId
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Invoice not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/:id/preview',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });

    const [clinic, settings, patient] = await Promise.all([
      ClinicModel.findById(req.user!.clinicId).lean(),
      ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId }).lean(),
      PatientModel.findById(invoice.patientId).lean(),
    ]);

    const uri = stellarPayURI(
      invoice.stellarDestination,
      invoice.total,
      invoice.currency,
      invoice.stellarMemo
    );
    const qrDataUrl = await buildQRDataUrl(uri);

    const patientName = patient
      ? `${(patient as any).firstName} ${(patient as any).lastName}`
      : 'Unknown';

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
  })
);

/**
 * @swagger
 * /invoices/{id}/send:
 *   post:
 *     summary: Email the invoice (with payment QR code) to the patient on file
 *     description: Requires the patient to have an email address on record. Moves a draft invoice to 'sent' status; sending an already-sent invoice does not change its status.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Invoice MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Invoice emailed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'Invoice sent' }
 *       400:
 *         description: Invoice is cancelled, or patient has no email address on file
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Invoice not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post(
  '/:id/send',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });
    if (invoice.status === 'cancelled') {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Cannot send a cancelled invoice' });
    }

    const patient = await PatientModel.findById(invoice.patientId).lean();
    const patientEmail = (patient as any)?.email;
    if (!patientEmail) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Patient has no email address on file' });
    }

    const uri = stellarPayURI(
      invoice.stellarDestination,
      invoice.total,
      invoice.currency,
      invoice.stellarMemo
    );
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
  })
);

const markPaidSchema = z.object({ txHash: z.string().min(1, 'txHash is required') });

/**
 * @swagger
 * /invoices/{id}/mark-paid:
 *   post:
 *     summary: Manually mark an invoice as paid with a known Stellar transaction hash
 *     description: Creates a linked, already-confirmed PaymentRecord for traceability and sets the invoice status to 'paid'. Use this for out-of-band payments; payments made through the normal payment-intent flow are reconciled automatically via webhooks.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Invoice MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [txHash]
 *             properties:
 *               txHash: { type: string, minLength: 1, description: 'Stellar transaction hash' }
 *     responses:
 *       200:
 *         description: Invoice marked as paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     invoiceNumber: { type: string, example: 'INV-000123' }
 *                     status: { type: string, example: paid }
 *                     paidAt: { type: string, format: date-time }
 *                     paidTxHash: { type: string }
 *                     paymentIntentId: { type: string, format: uuid }
 *       400:
 *         description: Validation error (missing txHash)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Invoice not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Invoice is already paid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post(
  '/:id/mark-paid',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema, body: markPaidSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { txHash } = req.body;

    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!invoice) return res.status(404).json({ error: 'NotFound', message: 'Invoice not found' });
    if (invoice.status === 'paid')
      return res.status(409).json({ error: 'AlreadyPaid', message: 'Invoice already paid' });

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
      { new: true }
    );

    return res.json({ status: 'success', data: updated });
  })
);

export const invoiceRoutes = router;
