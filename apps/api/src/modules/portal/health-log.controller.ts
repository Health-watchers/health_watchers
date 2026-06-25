import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { PatientHealthLogModel } from './models/patient-health-log.model';
import { checkThreshold } from './health-log-thresholds';

const router = Router();
const requirePatient = requireRoles('PATIENT');

const healthLogCreateSchema = z.object({
  metricType: z.enum(['weight', 'blood_pressure', 'blood_glucose', 'exercise']),
  value: z.number().positive(),
  valueDiastolic: z.number().positive().optional(),
  unit: z.string().min(1).max(30),
  loggedAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

const healthLogQuerySchema = z.object({
  metricType: z.enum(['weight', 'blood_pressure', 'blood_glucose', 'exercise']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  page: z.string().regex(/^\d+$/).optional(),
});

// ── POST /api/v1/portal/health-log ──────────────────────────────────────────
router.post(
  '/health-log',
  authenticate,
  requirePatient,
  validateRequest({ body: healthLogCreateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.user!;
    const { metricType, value, valueDiastolic, unit, loggedAt, notes } = req.body;

    const { isAlert, reason } = checkThreshold(metricType, value, valueDiastolic);

    const entry = await PatientHealthLogModel.create({
      patientId: new Types.ObjectId(patientId),
      metricType,
      value,
      valueDiastolic,
      unit,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      notes,
      isAlert,
    });

    return res.status(201).json({
      status: 'success',
      data: entry,
      ...(isAlert && { alert: reason }),
    });
  })
);

// ── GET /api/v1/portal/health-log ─────────────────────────────────────────────
router.get(
  '/health-log',
  authenticate,
  requirePatient,
  validateRequest({ query: healthLogQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.user!;
    const { metricType, from, to } = req.query as Record<string, string | undefined>;
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const page  = Math.max(parseInt(req.query.page  as string || '1',  10), 1);

    const filter: Record<string, unknown> = { patientId: new Types.ObjectId(patientId) };
    if (metricType) filter.metricType = metricType;
    if (from || to) {
      filter.loggedAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to   ? { $lte: new Date(to)   } : {}),
      };
    }

    const [data, total] = await Promise.all([
      PatientHealthLogModel.find(filter).sort({ loggedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PatientHealthLogModel.countDocuments(filter),
    ]);

    return res.json({ status: 'success', data, meta: { total, page, limit } });
  })
);

export { router as healthLogRoutes };
