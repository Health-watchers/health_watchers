/**
 * HL7 v2 export routes (Issue #1243).
 *
 * GET /patients/:id/hl7v2        – Full patient HL7 v2 bundle (ADT + ORU + RDE)
 * GET /patients/:id/hl7v2/adt    – ADT^A28 demographics only
 * GET /patients/:id/hl7v2/oru    – ORU^R01 lab results only
 * GET /patients/:id/hl7v2/rde    – RDE^O11 prescriptions only
 */

import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '@api/modules/audit/audit.service';
import logger from '@api/utils/logger';
import { bulkExportLimiter } from '@api/middlewares/rate-limit.middleware';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { LabResultModel } from '@api/modules/lab-results/lab-result.model';
import { buildHl7Bundle, buildAdtA28, buildOruR01, buildRdeO11 } from './hl7-v2-mapper';

const router = Router();

const HL7_ROLES = ['DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE'] as const;

async function loadPatientData(patientId: string) {
  const oid = new Types.ObjectId(patientId);
  const [patient, encounters, labResults] = await Promise.all([
    PatientModel.findById(oid).lean(),
    EncounterModel.find({ patientId: oid }).lean(),
    LabResultModel.find({ patientId: oid }).lean(),
  ]);
  return { patient, encounters, labResults };
}

/**
 * @swagger
 * /patients/{id}/hl7v2:
 *   get:
 *     summary: Export a patient's record as an HL7 v2 bundle (ADT + ORU + RDE messages)
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
 *         description: HL7 v2.5.1 pipe-delimited messages (text/plain)
 */
router.get(
  '/patients/:id/hl7v2',
  authenticate,
  requireRoles(...HL7_ROLES),
  bulkExportLimiter,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

    try {
      const { patient, encounters, labResults } = await loadPatientData(id);
      if (!patient)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      auditLog(
        {
          action: 'EXPORT_PATIENT_DATA',
          resourceType: 'Patient',
          resourceId: id,
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          metadata: { format: 'hl7v2', variant: 'bundle' },
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for HL7v2 export'));

      const bundle = buildHl7Bundle(patient, encounters as any[], labResults as any[]);
      const messages = [bundle.adt, bundle.oru, bundle.rde].filter(Boolean).join('\r\n---\r\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient-${(patient as any).systemId}-hl7v2.hl7"`
      );
      return res.send(messages);
    } catch (err: any) {
      logger.error({ err }, 'HL7v2 bundle export error');
      return res.status(500).json({ error: 'InternalError', message: 'HL7 export failed' });
    }
  }
);

router.get(
  '/patients/:id/hl7v2/adt',
  authenticate,
  requireRoles(...HL7_ROLES),
  bulkExportLimiter,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

    try {
      const patient = await PatientModel.findById(id).lean();
      if (!patient)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      auditLog(
        {
          action: 'EXPORT_PATIENT_DATA',
          resourceType: 'Patient',
          resourceId: id,
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          metadata: { format: 'hl7v2', variant: 'adt' },
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for HL7v2 ADT export'));

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient-${(patient as any).systemId}-adt.hl7"`
      );
      return res.send(buildAdtA28(patient));
    } catch (err: any) {
      logger.error({ err }, 'HL7v2 ADT export error');
      return res.status(500).json({ error: 'InternalError', message: 'HL7 ADT export failed' });
    }
  }
);

router.get(
  '/patients/:id/hl7v2/oru',
  authenticate,
  requireRoles(...HL7_ROLES),
  bulkExportLimiter,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

    try {
      const oid = new Types.ObjectId(id);
      const [patient, labResults] = await Promise.all([
        PatientModel.findById(oid).lean(),
        LabResultModel.find({ patientId: oid }).lean(),
      ]);
      if (!patient)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      auditLog(
        {
          action: 'EXPORT_PATIENT_DATA',
          resourceType: 'Patient',
          resourceId: id,
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          metadata: { format: 'hl7v2', variant: 'oru' },
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for HL7v2 ORU export'));

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient-${(patient as any).systemId}-oru.hl7"`
      );
      return res.send(buildOruR01(patient, labResults as any[]));
    } catch (err: any) {
      logger.error({ err }, 'HL7v2 ORU export error');
      return res.status(500).json({ error: 'InternalError', message: 'HL7 ORU export failed' });
    }
  }
);

router.get(
  '/patients/:id/hl7v2/rde',
  authenticate,
  requireRoles(...HL7_ROLES),
  bulkExportLimiter,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid patient ID format' });

    try {
      const oid = new Types.ObjectId(id);
      const [patient, encounters] = await Promise.all([
        PatientModel.findById(oid).lean(),
        EncounterModel.find({ patientId: oid }).lean(),
      ]);
      if (!patient)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

      const prescriptions: any[] = [];
      for (const enc of encounters as any[]) {
        for (const rx of enc.prescriptions ?? []) {
          prescriptions.push({ ...rx, encounterId: String(enc._id) });
        }
      }

      auditLog(
        {
          action: 'EXPORT_PATIENT_DATA',
          resourceType: 'Patient',
          resourceId: id,
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          metadata: { format: 'hl7v2', variant: 'rde' },
        },
        req
      ).catch((err) => logger.error({ err }, 'Audit log failed for HL7v2 RDE export'));

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient-${(patient as any).systemId}-rde.hl7"`
      );
      return res.send(buildRdeO11(patient, prescriptions));
    } catch (err: any) {
      logger.error({ err }, 'HL7v2 RDE export error');
      return res.status(500).json({ error: 'InternalError', message: 'HL7 RDE export failed' });
    }
  }
);

export default router;
