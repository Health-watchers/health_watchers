import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '@api/modules/audit/audit.service';
import logger from '@api/utils/logger';
import {
  buildPatientRecord,
  sendPatientJson,
  sendPatientPdf,
  buildClinicRecord,
  sendClinicZip,
} from './export.service';

/** Roles considered "authorized staff" for cross-patient access within a clinic */
const STAFF_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT'] as const;

const router = Router();

/**
 * @swagger
 * /patients/{id}/export:
 *   get:
 *     summary: Export a patient's complete health record (HIPAA Right of Access)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 */
router.get('/patients/:id/export', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const format = ((req.query.format as string) || '').toLowerCase();

  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

  if (!['json', 'pdf'].includes(format))
    return res.status(400).json({ error: 'BadRequest', message: 'format must be "json" or "pdf"' });

  try {
    const record = await buildPatientRecord(id);
    if (!record) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const { role, clinicId, userId } = req.user!;
    const patientClinicId = String((record.patient as any).clinicId);

    const isSelf = role === 'READ_ONLY' && userId === id;
    const isStaff =
      (STAFF_ROLES as readonly string[]).includes(role) && patientClinicId === clinicId;
    const isSuperAdmin = role === 'SUPER_ADMIN';

    if (!isSelf && !isStaff && !isSuperAdmin)
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Access denied to this patient record' });

    auditLog(
      { action: 'EXPORT_PATIENT_DATA', resourceType: 'Patient', resourceId: id, userId, clinicId },
      req
    ).catch((err) => logger.error({ err }, 'Audit log failed for patient export'));

    if (format === 'json') return sendPatientJson(res, record);
    return sendPatientPdf(res, record);
  } catch (err: any) {
    logger.error({ err }, 'Patient export error');
    return res.status(500).json({ error: 'InternalError', message: 'Export failed' });
  }
});

/**
 * @swagger
 * /clinics/{id}/export:
 *   get:
 *     summary: Export all clinic data as a ZIP archive (SUPER_ADMIN only)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/clinics/:id/export',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid clinic ID format' });

    try {
      const record = await buildClinicRecord(id);

      if (!record.patients.length && !record.encounters.length && !record.payments.length)
        return res
          .status(404)
          .json({ error: 'NotFound', message: 'No data found for this clinic' });

      auditLog(
        {
          action: 'EXPORT_PATIENT_DATA',
          resourceType: 'Clinic',
          resourceId: id,
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for clinic export'));

      return sendClinicZip(res, id, record);
    } catch (err: any) {
      logger.error({ err }, 'Clinic export error');
      return res.status(500).json({ error: 'InternalError', message: 'Export failed' });
    }
  }
);

export default router;
