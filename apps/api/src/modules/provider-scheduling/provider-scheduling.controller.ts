/**
 * Provider scheduling system — HTTP controller
 * Issue #1248
 *
 * Mounted at /api/v1/provider-scheduling (see routes/v1/index.ts).
 */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';
import { emitToClinic } from '../../realtime/socket';
import {
  upsertAvailabilitySchema,
  slotsQuerySchema,
  conflictsQuerySchema,
  createTemplateSchema,
  applyTemplateSchema,
  createRotationSchema,
  createTimeOffSchema,
  reviewTimeOffSchema,
  createOnCallSchema,
  optimizeSchema,
  idParamSchema,
} from './provider-scheduling.validation';
import {
  upsertAvailability,
  getAvailability,
  generateSlots,
  detectConflicts,
  applyTemplateToProviders,
  providerOnRotationDate,
  onCallForInstant,
  providerLoadForDay,
  pickLeastLoadedProvider,
} from './provider-scheduling.service';
import { assignDemand, type ProviderSlots } from './schedule-optimizer';
import { providerUtilization, waitTimeReport } from './provider-scheduling.analytics';
import { ScheduleTemplateModel } from './models/schedule-template.model';
import { ShiftRotationModel } from './models/shift-rotation.model';
import { TimeOffModel } from './models/time-off.model';
import { OnCallScheduleModel } from './models/on-call-schedule.model';
import { Types } from 'mongoose';

export const providerSchedulingRoutes = Router();
providerSchedulingRoutes.use(authenticate);

const MANAGER_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'] as const;
const PROVIDER_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN', 'DOCTOR', 'NURSE'] as const;

const fail = (res: Response, status: number, error: string, message: string): Response =>
  res.status(status).json({ error, message });

// ── Availability ───────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/availability',
  requireRoles(...PROVIDER_ROLES),
  validateRequest({ body: upsertAvailabilitySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const doc = await upsertAvailability({
        ...req.body,
        clinicId,
        updatedBy: userId,
      });
      emitToClinic(clinicId, 'provider-scheduling:availability-updated', {
        providerId: req.body.providerId,
        at: new Date().toISOString(),
      });
      return res.status(201).json({ status: 'success', data: doc });
    } catch (err) {
      logger.error({ err }, 'upsertAvailability failed');
      return fail(res, 500, 'InternalError', (err as Error).message);
    }
  }
);

providerSchedulingRoutes.get(
  '/availability/:id',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const doc = await getAvailability(req.params.id, req.user!.clinicId);
    if (!doc) return fail(res, 404, 'NotFound', 'No availability configured for this provider.');
    return res.json({ status: 'success', data: doc });
  }
);

// ── Slot generation ────────────────────────────────────────────────────────

providerSchedulingRoutes.get(
  '/slots',
  validateRequest({ query: slotsQuerySchema }),
  async (req: Request, res: Response) => {
    const { providerId, from, to } = req.query as Record<string, string>;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (toDate <= fromDate) return fail(res, 400, 'BadRequest', '`to` must be after `from`.');
    if (toDate.getTime() - fromDate.getTime() > 62 * 24 * 60 * 60 * 1000) {
      return fail(res, 400, 'BadRequest', 'Range may not exceed 62 days.');
    }

    const { slots, availabilityFound } = await generateSlots({
      providerId,
      clinicId: req.user!.clinicId,
      from: fromDate,
      to: toDate,
    });

    return res.json({
      status: 'success',
      data: { slots, availabilityFound, count: slots.length },
    });
  }
);

// ── Conflict detection ─────────────────────────────────────────────────────

providerSchedulingRoutes.get(
  '/conflicts',
  validateRequest({ query: conflictsQuerySchema }),
  async (req: Request, res: Response) => {
    const { providerId, start, end, excludeAppointmentId } = req.query as Record<string, string>;
    const conflicts = await detectConflicts({
      providerId,
      clinicId: req.user!.clinicId,
      start: new Date(start),
      end: new Date(end),
      excludeAppointmentId,
    });
    return res.json({
      status: 'success',
      data: { hasConflict: conflicts.length > 0, conflicts },
    });
  }
);

// ── Templates ──────────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/templates',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: createTemplateSchema }),
  async (req: Request, res: Response) => {
    try {
      const doc = await ScheduleTemplateModel.create({
        ...req.body,
        clinicId: new Types.ObjectId(req.user!.clinicId),
        createdBy: new Types.ObjectId(req.user!.userId),
      });
      return res.status(201).json({ status: 'success', data: doc });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return fail(res, 409, 'Conflict', 'A template with that name already exists.');
      }
      return fail(res, 500, 'InternalError', (err as Error).message);
    }
  }
);

providerSchedulingRoutes.get('/templates', async (req: Request, res: Response) => {
  const templates = await ScheduleTemplateModel.find({
    clinicId: new Types.ObjectId(req.user!.clinicId),
  })
    .sort({ name: 1 })
    .lean();
  return res.json({ status: 'success', data: templates });
});

providerSchedulingRoutes.post(
  '/templates/:id/apply',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: idParamSchema, body: applyTemplateSchema }),
  async (req: Request, res: Response) => {
    try {
      const results = await applyTemplateToProviders(
        req.params.id,
        req.user!.clinicId,
        req.body.providerIds,
        req.user!.userId
      );
      for (const providerId of req.body.providerIds) {
        emitToClinic(req.user!.clinicId, 'provider-scheduling:availability-updated', {
          providerId,
        });
      }
      return res.json({ status: 'success', data: { updated: results.length } });
    } catch (err) {
      if ((err as { code?: string }).code === 'TEMPLATE_NOT_FOUND') {
        return fail(res, 404, 'NotFound', 'Template not found.');
      }
      return fail(res, 500, 'InternalError', (err as Error).message);
    }
  }
);

// ── Shift rotation ─────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/rotations',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: createRotationSchema }),
  async (req: Request, res: Response) => {
    const doc = await ShiftRotationModel.create({
      name: req.body.name,
      startDate: new Date(req.body.startDate),
      cycleLengthDays: req.body.cycleLengthDays,
      pattern: req.body.pattern.map(
        (p: { dayOffset: number; providerId: string; role: string }) => ({
          dayOffset: p.dayOffset,
          providerId: new Types.ObjectId(p.providerId),
          role: p.role,
        })
      ),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      createdBy: new Types.ObjectId(req.user!.userId),
    });
    return res.status(201).json({ status: 'success', data: doc });
  }
);

providerSchedulingRoutes.get(
  '/rotations/:id/on-date',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    const dateStr = (req.query.date as string) || new Date().toISOString();
    const result = await providerOnRotationDate(req.params.id, new Date(dateStr));
    if (!result) return fail(res, 404, 'NotFound', 'Rotation not found.');
    return res.json({ status: 'success', data: result });
  }
);

// ── Time-off ───────────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/time-off',
  requireRoles(...PROVIDER_ROLES),
  validateRequest({ body: createTimeOffSchema }),
  async (req: Request, res: Response) => {
    const doc = await TimeOffModel.create({
      providerId: new Types.ObjectId(req.body.providerId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      start: new Date(req.body.start),
      end: new Date(req.body.end),
      type: req.body.type,
      reason: req.body.reason,
      requestedBy: new Types.ObjectId(req.user!.userId),
      status: 'pending',
    });
    return res.status(201).json({ status: 'success', data: doc });
  }
);

providerSchedulingRoutes.get('/time-off', async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { clinicId: new Types.ObjectId(req.user!.clinicId) };
  if (req.query.providerId && /^[0-9a-fA-F]{24}$/.test(String(req.query.providerId))) {
    filter.providerId = new Types.ObjectId(String(req.query.providerId));
  }
  if (typeof req.query.status === 'string') filter.status = req.query.status;
  const rows = await TimeOffModel.find(filter).sort({ start: -1 }).limit(500).lean();
  return res.json({ status: 'success', data: rows });
});

providerSchedulingRoutes.patch(
  '/time-off/:id',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: idParamSchema, body: reviewTimeOffSchema }),
  async (req: Request, res: Response) => {
    const updated = await TimeOffModel.findOneAndUpdate(
      { _id: new Types.ObjectId(req.params.id), clinicId: new Types.ObjectId(req.user!.clinicId) },
      {
        status: req.body.status,
        reviewNote: req.body.reviewNote,
        reviewedBy: new Types.ObjectId(req.user!.userId),
        reviewedAt: new Date(),
      },
      { new: true }
    ).lean();
    if (!updated) return fail(res, 404, 'NotFound', 'Time-off request not found.');

    if (req.body.status === 'approved') {
      emitToClinic(req.user!.clinicId, 'provider-scheduling:availability-updated', {
        providerId: String(updated.providerId),
        reason: 'time_off_approved',
      });
    }
    return res.json({ status: 'success', data: updated });
  }
);

// ── On-call ────────────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/on-call',
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: createOnCallSchema }),
  async (req: Request, res: Response) => {
    const doc = await OnCallScheduleModel.create({
      providerId: new Types.ObjectId(req.body.providerId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      start: new Date(req.body.start),
      end: new Date(req.body.end),
      role: req.body.role ?? 'primary',
      contact: req.body.contact,
      createdBy: new Types.ObjectId(req.user!.userId),
    });
    return res.status(201).json({ status: 'success', data: doc });
  }
);

providerSchedulingRoutes.get('/on-call', async (req: Request, res: Response) => {
  const at = req.query.at ? new Date(String(req.query.at)) : new Date();
  const rows = await onCallForInstant(req.user!.clinicId, at);
  return res.json({ status: 'success', data: { at: at.toISOString(), onCall: rows } });
});

// ── Optimization ───────────────────────────────────────────────────────────

providerSchedulingRoutes.post(
  '/optimize',
  requireRoles(...PROVIDER_ROLES),
  validateRequest({ body: optimizeSchema }),
  async (req: Request, res: Response) => {
    const { date, providerIds, demand } = req.body as {
      date: string;
      providerIds: string[];
      demand: number;
    };
    const day = new Date(date);
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const providerSlots: ProviderSlots[] = [];
    for (const providerId of providerIds) {
      const { slots } = await generateSlots({
        providerId,
        clinicId: req.user!.clinicId,
        from: dayStart,
        to: dayEnd,
      });
      providerSlots.push({ providerId, slots });
    }

    const result = assignDemand(demand, providerSlots, dayStart);
    return res.json({ status: 'success', data: result });
  }
);

// ── Analytics ──────────────────────────────────────────────────────────────

function parseRange(req: Request): { from: Date; to: Date } {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

providerSchedulingRoutes.get(
  '/analytics/utilization',
  requireRoles(...PROVIDER_ROLES),
  async (req: Request, res: Response) => {
    const { from, to } = parseRange(req);
    const data = await providerUtilization(req.user!.clinicId, from, to);
    return res.json({ status: 'success', data: { from, to, providers: data } });
  }
);

providerSchedulingRoutes.get(
  '/analytics/wait-times',
  requireRoles(...PROVIDER_ROLES),
  async (req: Request, res: Response) => {
    const { from, to } = parseRange(req);
    const data = await waitTimeReport(req.user!.clinicId, from, to);
    return res.json({ status: 'success', data: { from, to, ...data } });
  }
);

providerSchedulingRoutes.get('/analytics/load', async (req: Request, res: Response) => {
  const idsRaw = String(req.query.providerIds ?? '');
  const providerIds = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-fA-F]{24}$/.test(s));
  if (providerIds.length === 0) {
    return fail(res, 400, 'BadRequest', 'providerIds (comma-separated) is required.');
  }
  const day = req.query.date ? new Date(String(req.query.date)) : new Date();
  const load = await providerLoadForDay(req.user!.clinicId, providerIds, day);
  const leastLoaded = await pickLeastLoadedProvider(req.user!.clinicId, providerIds, day);
  return res.json({ status: 'success', data: { date: day.toISOString(), load, leastLoaded } });
});
