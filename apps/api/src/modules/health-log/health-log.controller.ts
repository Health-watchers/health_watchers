import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PatientHealthLogModel, MetricType } from './health-log.model';
import { isAbnormal } from './health-log.service';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const VALID_METRICS: [MetricType, ...MetricType[]] = [
  'weight',
  'blood_pressure',
  'blood_glucose',
  'exercise_minutes',
  'heart_rate',
];

const logHealthMetricSchema = z.object({
  metricType: z.enum(VALID_METRICS),
  value: z.number().positive(),
  unit: z.string().min(1).max(20),
  loggedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
});

const healthLogQuerySchema = z.object({
  metricType: z.enum(VALID_METRICS).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export const healthLogRouter = Router();

// POST /health-log  — patient logs a metric (mounted under /portal)
healthLogRouter.post(
  '/health-log',
  authenticate,
  requireRoles('PATIENT'),
  validateRequest({ body: logHealthMetricSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.user!.patientId;
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Patient ID not found in token' });
    }
    const { metricType, value, unit, loggedAt, notes } = req.body as z.infer<
      typeof logHealthMetricSchema
    >;
    const flagged = isAbnormal(metricType, value);
    const log = await PatientHealthLogModel.create({
      patientId,
      metricType,
      value,
      unit,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      notes,
      flagged,
    });
    return res.status(201).json({ success: true, data: log, alert: flagged });
  })
);

// GET /health-log  — patient views own history (mounted under /portal)
healthLogRouter.get(
  '/health-log',
  authenticate,
  requireRoles('PATIENT'),
  validateRequest({ query: healthLogQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.user!.patientId;
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Patient ID not found in token' });
    }
    const { metricType, limit = '50' } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = { patientId };
    if (metricType) filter.metricType = metricType;
    const logs = await PatientHealthLogModel.find(filter)
      .sort({ loggedAt: -1 })
      .limit(Number(limit))
      .lean();
    return res.json({ success: true, data: logs });
  })
);

// GET /patients/:id/health-log  — clinician views patient history (mounted under /patients)
export const patientHealthLogRouter = Router({ mergeParams: true });

patientHealthLogRouter.get(
  '/:id/health-log',
  authenticate,
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ query: healthLogQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { metricType, limit = '100' } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = { patientId: id };
    if (metricType) filter.metricType = metricType;
    const logs = await PatientHealthLogModel.find(filter)
      .sort({ loggedAt: -1 })
      .limit(Number(limit))
      .lean();
    return res.json({ success: true, data: logs });
  })
);
