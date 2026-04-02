import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { exportRateLimit } from '@api/middlewares/export-rate-limit.middleware';
import { createAuditLog } from '@api/modules/audit/audit.service';
import {
  buildPatientRecord,
  sendPatientJson,
  sendPatientPdf,
  buildClinicRecord,
  sendClinicZip,
} from './export.service';

const router = Router();

/**
 * @swagger
 * /patients/{id}/export:
 *   get:
 *     summary: Export a patient's complete health record (HIPAA Right of Access)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         required: true
 *         schema: { type: string, enum: [json, pdf] }
 *     responses:
 *       200:
 *         description: Patient record exported
 *       400:
 *         description: Unsupported format
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Patient not found
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
  '/patients/:id/export',
  authenticate,
  exportRateLimit,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const format = (req.query.format as string || '').toLowerCase();

    if (!['json', 'pdf'].includes(format))
      return res.status(400).json({ error: 'BadRequest', message: 'format must be "json" or "pdf"' });

    try {
      const record = await buildPatientRecord(id);
      if (!record)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      // Authorization: non-admins can only export patients from their own clinic
      const { role, clinicId } = req.user!;
      const patientClinicId = String((record.patient as any).clinicId);
      if (role !== 'SUPER_ADMIN' && patientClinicId !== clinicId)
        return res.status(403).json({ error: 'Forbidden', message: 'Access denied to this patient record' });

      // Audit log (fire-and-forget — don't block the response)
      createAuditLog('EXPORT_PATIENT_DATA', req, id, format).catch(console.error);

      if (format === 'json') return sendPatientJson(res, record);
      return sendPatientPdf(res, record);

    } catch (err: any) {
      console.error('[export] patient export error:', err);
      return res.status(500).json({ error: 'InternalError', message: 'Export failed' });
    }
  },
);

/**
 * @swagger
 * /clinics/{id}/export:
 *   get:
 *     summary: Export all clinic data as a ZIP archive (SUPER_ADMIN only)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Clinic data ZIP archive
 *       403:
 *         description: Forbidden — SUPER_ADMIN only
 *       404:
 *         description: No data found for clinic
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
  '/clinics/:id/export',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  exportRateLimit,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const record = await buildClinicRecord(id);

      if (!record.patients.length && !record.encounters.length && !record.payments.length)
        return res.status(404).json({ error: 'NotFound', message: 'No data found for this clinic' });

      createAuditLog('EXPORT_CLINIC_DATA', req, id, 'zip').catch(console.error);

      return sendClinicZip(res, id, record);

    } catch (err: any) {
      console.error('[export] clinic export error:', err);
      return res.status(500).json({ error: 'InternalError', message: 'Export failed' });
    }
  },
);

export default router;
