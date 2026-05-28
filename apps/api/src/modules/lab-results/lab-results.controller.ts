import { Router, Request, Response } from 'express';
import { LabResultModel } from './lab-result.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { detectCriticalValues } from './critical-value.service';
import { createNotification } from '../notifications/notification.service';
import { emitToUser } from '@api/realtime/socket';
import { AuditLogModel } from '../audit/audit-log.model';
import { sendEmail } from '@api/lib/email.service';
import { UserModel } from '../auth/models/user.model';

const router = Router();
router.use(authenticate);

const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const RESULT_ENTRY_ROLES = requireRoles('DOCTOR', 'NURSE');

// POST /api/v1/lab-results — Order a lab test
router.post(
  '/',
  CLINICAL_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, encounterId, testName, testCode, notes } = req.body;
    if (!patientId || !testName) {
      return res.status(400).json({ error: 'ValidationError', message: 'patientId and testName are required' });
    }
    const doc = await LabResultModel.create({
      patientId,
      encounterId,
      clinicId: req.user!.clinicId,
      orderedBy: req.user!.userId,
      testName,
      testCode,
      notes,
      status: 'ordered',
      orderedAt: new Date(),
    });
    return res.status(201).json({ status: 'success', data: doc });
  }),
);

// GET /api/v1/lab-results — List lab results (filter by patient, status, date)
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, from, to } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    if (from || to) {
      filter.orderedAt = {};
      if (from) (filter.orderedAt as any).$gte = new Date(from);
      if (to) (filter.orderedAt as any).$lte = new Date(to);
    }
    const docs = await LabResultModel.find(filter).sort({ orderedAt: -1 });
    return res.json({ status: 'success', data: docs });
  }),
);

// GET /api/v1/lab-results/critical — Get pending critical value acknowledgments
router.get(
  '/critical',
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await LabResultModel.find({
      clinicId: req.user!.clinicId,
      isCritical: true,
      criticalAcknowledgedAt: { $exists: false },
    })
      .populate('patientId', 'firstName lastName')
      .populate('orderedBy', 'firstName lastName')
      .sort({ resultedAt: -1 });
    return res.json({ status: 'success', data: docs });
  }),
);

// GET /api/v1/lab-results/:id — Get lab result details
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    return res.json({ status: 'success', data: doc });
  }),
);

// PUT /api/v1/lab-results/:id/results — Enter lab results (DOCTOR/NURSE)
router.put(
  '/:id/results',
  RESULT_ENTRY_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { results, notes, attachmentUrl } = req.body;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'results array is required' });
    }

    // Detect critical values
    const { isCritical, criticalReason } = detectCriticalValues(results);

    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      {
        results,
        notes,
        attachmentUrl,
        status: 'resulted',
        resultedAt: new Date(),
        isCritical,
        criticalReason: isCritical ? criticalReason : undefined,
      },
      { new: true, runValidators: true },
    );

    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });

    // If critical, send alerts
    if (isCritical && doc.orderedBy) {
      const doctor = await UserModel.findById(doc.orderedBy).lean();
      if (doctor) {
        // Create in-app notification
        await createNotification({
          userId: doc.orderedBy,
          clinicId: doc.clinicId,
          type: 'lab_result_ready',
          title: 'Critical Lab Result',
          message: `Critical value detected: ${criticalReason}`,
          metadata: { labResultId: doc._id, isCritical: true },
        });

        // Emit Socket.IO event
        try {
          emitToUser(String(doc.orderedBy), 'lab:critical', {
            labResultId: doc._id,
            reason: criticalReason,
            testName: doc.testName,
          });
        } catch {
          // Socket may not be initialized
        }

        // Send email alert
        if (doctor.email) {
          await sendEmail({
            to: doctor.email,
            subject: `URGENT: Critical Lab Result - ${doc.testName}`,
            html: `<p>A critical lab value has been detected:</p><p><strong>${criticalReason}</strong></p><p>Please review immediately.</p>`,
          });
        }

        // Audit log
        await AuditLogModel.create({
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          action: 'CRITICAL_LAB_RESULT',
          resourceType: 'LabResult',
          resourceId: String(doc._id),
          outcome: 'SUCCESS',
          metadata: { reason: criticalReason },
        });
      }
    }

    return res.json({
      status: 'success',
      data: doc,
      ...(isCritical && { alert: { critical: true, reason: criticalReason } }),
    });
  }),
);

// POST /api/v1/lab-results/:id/acknowledge — Acknowledge critical value
router.post(
  '/:id/acknowledge',
  CLINICAL_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isCritical: true },
      {
        criticalAcknowledgedBy: req.user!.userId,
        criticalAcknowledgedAt: new Date(),
      },
      { new: true },
    );

    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Critical lab result not found' });
    }

    // Audit log
    await AuditLogModel.create({
      userId: req.user!.userId,
      clinicId: req.user!.clinicId,
      action: 'CRITICAL_LAB_ACKNOWLEDGED',
      resourceType: 'LabResult',
      resourceId: String(doc._id),
      outcome: 'SUCCESS',
    });

    return res.json({ status: 'success', data: doc });
  }),
);

export const labResultRoutes = router;
