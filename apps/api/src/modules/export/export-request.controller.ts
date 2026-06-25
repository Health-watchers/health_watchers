import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '@api/modules/audit/audit.service';
import { sendDataExportReadyEmail } from '@api/lib/email.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import logger from '@api/utils/logger';
import { ExportRequestModel, ExportFormat } from './export-request.model';
import {
  buildComprehensiveRecord,
  renderJson,
  renderCsv,
  renderFhir,
  streamPdf,
} from './export-request.service';

const router = Router();
const requirePatient = requireRoles('PATIENT');

const SLA_DAYS = 30;
const DOWNLOAD_WINDOW_DAYS = 7;
const VALID_FORMATS: ExportFormat[] = ['json', 'pdf', 'csv', 'fhir'];

const APP_BASE_URL = () => process.env.APP_BASE_URL || 'http://localhost:3000';
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Adds SLA tracking fields to a serialized request. */
function withSla(reqDoc: any) {
  const now = Date.now();
  const deadline = new Date(reqDoc.slaDeadline).getTime();
  const fulfilled = reqDoc.fulfilledAt ? new Date(reqDoc.fulfilledAt).getTime() : null;
  const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  let slaStatus: 'on_time' | 'breached' | 'pending';
  if (fulfilled) slaStatus = fulfilled <= deadline ? 'on_time' : 'breached';
  else slaStatus = now <= deadline ? 'pending' : 'breached';
  return { ...reqDoc, sla: { deadline: reqDoc.slaDeadline, daysRemaining, status: slaStatus } };
}

/**
 * @swagger
 * /portal/export-request:
 *   post:
 *     summary: Request a complete copy of your health record (HIPAA Right of Access)
 *     tags: [Patient Portal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               formats:
 *                 type: array
 *                 items: { type: string, enum: [json, pdf, csv, fhir] }
 *     responses:
 *       201: { description: Export request created and fulfilled; secure link emailed }
 */
router.post('/export-request', authenticate, requirePatient, async (req: Request, res: Response) => {
  try {
    const { patientId, clinicId, userId } = req.user!;
    if (!patientId) return res.status(400).json({ error: 'BadRequest', message: 'No patient record linked to this account' });

    const requested: ExportFormat[] = Array.isArray(req.body?.formats) ? req.body.formats : VALID_FORMATS;
    const formats = requested.filter((f): f is ExportFormat => VALID_FORMATS.includes(f));
    if (formats.length === 0) {
      return res.status(400).json({ error: 'BadRequest', message: `formats must include at least one of: ${VALID_FORMATS.join(', ')}` });
    }

    const now = new Date();
    const slaDeadline = new Date(now.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000);

    const exportReq = await ExportRequestModel.create({
      patientId,
      clinicId,
      requestedBy: userId,
      formats,
      status: 'processing',
      requestedAt: now,
      slaDeadline,
    });

    await auditLog(
      { action: 'DATA_EXPORT_REQUEST', userId, clinicId, resourceType: 'ExportRequest', resourceId: String(exportReq._id), metadata: { patientId, formats } },
      req,
    );

    // Verify the record can be assembled, then mark ready and issue a secure link.
    const record = await buildComprehensiveRecord(String(patientId));
    if (!record) {
      exportReq.status = 'failed';
      exportReq.failureReason = 'Patient record not found';
      await exportReq.save();
      return res.status(404).json({ error: 'NotFound', message: 'Patient record not found' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const downloadExpiresAt = new Date(now.getTime() + DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    exportReq.downloadTokenHash = hashToken(rawToken);
    exportReq.downloadExpiresAt = downloadExpiresAt;
    exportReq.status = 'ready';
    exportReq.fulfilledAt = new Date();
    await exportReq.save();

    await auditLog(
      { action: 'DATA_EXPORT_FULFILLED', userId, clinicId, resourceType: 'ExportRequest', resourceId: String(exportReq._id), metadata: { fulfilledAt: exportReq.fulfilledAt } },
      req,
    );

    // Send the secure download link (NOT the data) to the patient's email on file.
    const user = await UserModel.findById(userId).lean();
    const downloadUrl = `${APP_BASE_URL()}/portal/export/download/${rawToken}`;
    if (user?.email) sendDataExportReadyEmail(user.email, downloadUrl, downloadExpiresAt);

    const obj = exportReq.toObject();
    delete obj.downloadTokenHash;
    return res.status(201).json({
      status: 'success',
      data: withSla(obj),
      // Returned for SPA convenience; the canonical delivery is the emailed link.
      downloadUrl,
    });
  } catch (err: any) {
    logger.error({ err }, 'Export request failed');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to create export request' });
  }
});

/**
 * @swagger
 * /portal/export-requests:
 *   get:
 *     summary: List your export requests with SLA tracking
 *     tags: [Patient Portal]
 *     security:
 *       - bearerAuth: []
 */
router.get('/export-requests', authenticate, requirePatient, async (req: Request, res: Response) => {
  const requests = await ExportRequestModel.find({ patientId: req.user!.patientId })
    .sort({ requestedAt: -1 })
    .lean();
  return res.json({ status: 'success', data: requests.map(withSla) });
});

/**
 * @swagger
 * /portal/export/download/{token}:
 *   get:
 *     summary: Securely download a fulfilled export (token-authenticated link)
 *     tags: [Patient Portal]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, pdf, csv, fhir] }
 *     responses:
 *       200: { description: The exported record in the requested format }
 *       404: { description: Invalid, expired, or already-consumed link }
 */
router.get('/export/download/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '');
    if (!token) return res.status(404).json({ error: 'NotFound', message: 'Invalid download link' });

    const exportReq = await ExportRequestModel.findOne({ downloadTokenHash: hashToken(token) }).select(
      '+downloadTokenHash',
    );
    if (!exportReq || exportReq.status !== 'ready') {
      return res.status(404).json({ error: 'NotFound', message: 'Invalid or unavailable download link' });
    }
    if (exportReq.downloadExpiresAt && exportReq.downloadExpiresAt < new Date()) {
      exportReq.status = 'expired';
      await exportReq.save();
      return res.status(404).json({ error: 'NotFound', message: 'This download link has expired' });
    }

    const format = (String(req.query.format || 'json').toLowerCase() as ExportFormat);
    if (!VALID_FORMATS.includes(format) || !exportReq.formats.includes(format)) {
      return res.status(400).json({ error: 'BadRequest', message: `format must be one of: ${exportReq.formats.join(', ')}` });
    }

    const record = await buildComprehensiveRecord(String(exportReq.patientId));
    if (!record) return res.status(404).json({ error: 'NotFound', message: 'Record no longer available' });

    exportReq.downloadCount = (exportReq.downloadCount ?? 0) + 1;
    await exportReq.save();

    await auditLog({
      action: 'DATA_EXPORT_FULFILLED',
      clinicId: String(exportReq.clinicId),
      resourceType: 'ExportRequest',
      resourceId: String(exportReq._id),
      metadata: { event: 'downloaded', format },
    });

    const base = `health-record-${record.patient.systemId || exportReq.patientId}`;
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      return streamPdf(res, record);
    }
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.send(renderCsv(record));
    }
    if (format === 'fhir') {
      res.setHeader('Content-Type', 'application/fhir+json');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.fhir.json"`);
      return res.json(renderFhir(record));
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    return res.json(renderJson(record));
  } catch (err: any) {
    logger.error({ err }, 'Export download failed');
    return res.status(500).json({ error: 'InternalError', message: 'Download failed' });
  }
});

export const exportRequestRoutes = router;
