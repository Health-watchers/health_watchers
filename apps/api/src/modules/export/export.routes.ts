import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '@api/modules/audit/audit.service';
import logger from '@api/utils/logger';
import { bulkExportLimiter } from '@api/middlewares/rate-limit.middleware';
import {
  buildPatientRecord,
  sendPatientJson,
  sendPatientPdf,
  buildClinicRecord,
  sendClinicZip,
  sendResearchExport,
} from './export.service';
import { buildFhirBundle } from './fhir-mapper';

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
router.get('/patients/:id/export', authenticate, bulkExportLimiter, async (req: Request, res: Response) => {
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

    // Check data_sharing consent for staff-initiated exports
    if (isStaff && !isSuperAdmin) {
      const { hasConsent } = await import('../consent/consent.controller');
      const consentGranted = await hasConsent(id, clinicId, 'data_sharing');
      if (!consentGranted) {
        return res.status(403).json({
          error: 'ConsentRequired',
          message: 'Patient has not consented to data sharing. Please obtain consent first.',
        });
      }
    }

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
  bulkExportLimiter,
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

/**
 * @swagger
 * /research/export:
 *   get:
 *     summary: Export anonymized patient data for research (SUPER_ADMIN only, requires IRB approval)
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: irbApproved
 *         required: true
 *         schema:
 *           type: boolean
 *         description: IRB approval flag
 */
router.get(
  '/research/export',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    const irbApproved = req.query.irbApproved === 'true';

    if (!irbApproved) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'IRB approval is required for research exports',
      });
    }

    try {
      const { userId, clinicId } = req.user!;

      auditLog(
        {
          action: 'EXPORT_RESEARCH_DATA',
          resourceType: 'ResearchExport',
          resourceId: 'all',
          userId,
          clinicId,
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for research export'));

      return sendResearchExport(res);
    } catch (err: any) {
      logger.error({ err }, 'Research export error');
      return res.status(500).json({ error: 'InternalError', message: 'Export failed' });
    }
  }
);

export default router;

/**
 * @swagger
 * /patients/{id}/fhir:
 *   get:
 *     summary: Export patient data as a FHIR R4 Bundle
 *     description: Returns a FHIR R4 collection Bundle containing Patient, Encounter, Condition, Observation, and MedicationRequest resources. Requires DOCTOR, CLINIC_ADMIN, or SUPER_ADMIN role.
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *     responses:
 *       200:
 *         description: FHIR R4 Bundle
 *         content:
 *           application/fhir+json:
 *             schema:
 *               type: object
 *               properties:
 *                 resourceType: { type: string, example: Bundle }
 *                 type: { type: string, example: collection }
 *                 total: { type: integer }
 *                 entry: { type: array, items: { type: object } }
 *       400:
 *         description: Invalid patient ID
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Patient not found
 */
router.get(
  '/patients/:id/fhir',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

    try {
      const record = await buildPatientRecord(id);
      if (!record) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      auditLog(
        { action: 'EXPORT_PATIENT_DATA', resourceType: 'Patient', resourceId: id, userId: req.user!.userId, clinicId: req.user!.clinicId },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for FHIR export'));

      const bundle = buildFhirBundle(record.patient, record.encounters);
      res.setHeader('Content-Type', 'application/fhir+json');
      return res.json(bundle);
    } catch (err: any) {
      logger.error({ err }, 'FHIR export error');
      return res.status(500).json({ error: 'InternalError', message: 'FHIR export failed' });
    }
  }
);
