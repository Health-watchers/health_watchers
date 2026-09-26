import { Router, Request, Response } from 'express';
import { LabResultModel } from './lab-result.model';
import { toLabResultResponse } from './lab-results.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginate, parsePagination } from '../../utils/paginate';
import { detectCriticalValues } from './critical-value.service';
import { createNotification } from '../notifications/notification.service';
import { emitToClinic, emitToUser } from '@api/realtime/socket';
import { AuditLogModel } from '../audit/audit-log.model';
import { sendEmail } from '@api/lib/email.service';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import logger from '@api/utils/logger';
import {
  orderLabResultSchema,
  enterLabResultsSchema,
  listLabResultsQuerySchema,
  reviewLabResultSchema,
  idParamSchema,
} from './lab-results.validation';

const router = Router();
router.use(authenticate);

const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const RESULT_ENTRY_ROLES = requireRoles('DOCTOR', 'NURSE');

// POST /api/v1/lab-results — Order a lab test
router.post(
  '/',
  CLINICAL_ROLES,
  validateRequest({ body: orderLabResultSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, encounterId, testName, testCode, notes } = req.body;
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
    return res
      .status(201)
      .json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

// GET /api/v1/lab-results — List lab results (filter by patient, status, date)
router.get(
  '/',
  validateRequest({ query: listLabResultsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, from, to, reviewed, isCritical, includePatient } =
      req.query as Record<string, string>;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    if (reviewed) filter.reviewedAt = { $exists: reviewed === 'true' };
    if (isCritical) filter.isCritical = isCritical === 'true';
    if (from || to) {
      filter.orderedAt = {};
      if (from) (filter.orderedAt as any).$gte = new Date(from);
      if (to) (filter.orderedAt as any).$lte = new Date(to);
    }
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const result = await paginate(LabResultModel, filter, page, limit, { orderedAt: -1 });
    const data = result.data.map((d: any) => toLabResultResponse(d, req.user!.role));

    // Worklists need patient names; batch-load them instead of one request per row
    if (includePatient === 'true' && data.length) {
      const patients = await PatientModel.find({
        _id: { $in: Array.from(new Set(data.map((d) => d.patientId))) },
        clinicId: req.user!.clinicId,
      })
        .select('firstName lastName systemId')
        .lean();
      const byId = new Map(patients.map((p: any) => [String(p._id), p]));
      return res.json({
        status: 'success',
        data: data.map((d) => {
          const p = byId.get(d.patientId);
          return p
            ? {
                ...d,
                patient: { firstName: p.firstName, lastName: p.lastName, systemId: p.systemId },
              }
            : d;
        }),
        meta: result.meta,
      });
    }

    return res.json({ status: 'success', data, meta: result.meta });
  })
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
    return res.json({
      status: 'success',
      data: docs.map((d) => toLabResultResponse(d, req.user!.role)),
    });
  })
);

// GET /api/v1/lab-results/:id — Get lab result details
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    return res.json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

// PUT /api/v1/lab-results/:id/results — Enter lab results (DOCTOR/NURSE)
router.put(
  '/:id/results',
  RESULT_ENTRY_ROLES,
  validateRequest({ params: idParamSchema, body: enterLabResultsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { results, notes, attachmentUrl } = req.body;

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
      { new: true, runValidators: true }
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

        // Emit Socket.IO event to the ordering clinician and the clinic-wide worklist
        try {
          const payload = {
            labResultId: doc._id,
            patientId: String(doc.patientId),
            reason: criticalReason,
            testName: doc.testName,
          };
          emitToUser(String(doc.orderedBy), 'lab:critical', payload);
          emitToClinic(String(doc.clinicId), 'lab:critical', payload);
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

    if (!isCritical) {
      try {
        emitToClinic(String(doc.clinicId), 'lab:resulted', {
          labResultId: doc._id,
          patientId: String(doc.patientId),
          testName: doc.testName,
        });
      } catch {
        // Socket may not be initialized
      }
    }

    return res.json({
      status: 'success',
      data: toLabResultResponse(doc, req.user!.role),
      ...(isCritical && { alert: { critical: true, reason: criticalReason } }),
    });
  })
);

// POST /api/v1/lab-results/:id/acknowledge — Acknowledge critical value
router.post(
  '/:id/acknowledge',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isCritical: true },
      {
        criticalAcknowledgedBy: req.user!.userId,
        criticalAcknowledgedAt: new Date(),
      },
      { new: true }
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

    return res.json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

// POST /api/v1/lab-results/:id/review — Mark a resulted lab as reviewed (optional comment)
router.post(
  '/:id/review',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema, body: reviewLabResultSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await LabResultModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      status: 'resulted',
    });
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Resulted lab result not found' });
    }

    const now = new Date();
    existing.reviewedBy = req.user!.userId as any;
    existing.reviewedAt = now;
    existing.reviewComment = req.body.comment || undefined;
    // Reviewing a critical result also acknowledges it
    if (existing.isCritical && !existing.criticalAcknowledgedAt) {
      existing.criticalAcknowledgedBy = req.user!.userId as any;
      existing.criticalAcknowledgedAt = now;
    }
    await existing.save();

    await AuditLogModel.create({
      userId: req.user!.userId,
      clinicId: req.user!.clinicId,
      action: 'UPDATE',
      resourceType: 'LabResult',
      resourceId: String(existing._id),
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.get('user-agent') ?? 'unknown',
    }).catch((err) => logger.error({ err }, 'Failed to write lab review audit log'));

    return res.json({ status: 'success', data: toLabResultResponse(existing, req.user!.role) });
  })
);

export const labResultRoutes = router;
