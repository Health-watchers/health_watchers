/**
 * #1251 — Reporting & analytics engine HTTP surface.
 *
 * Mounted under `/api/v1/reports` alongside the existing `reportRoutes`.
 * All routes require an authenticated CLINIC_ADMIN / SUPER_ADMIN and are
 * tenant-scoped by `req.user.clinicId`.
 *
 *   GET  /reports/datasources                 field catalogue for the builder
 *   GET  /reports/templates                   predefined report templates
 *   POST /reports/query                       run an ad-hoc custom query
 *   POST /reports/templates/:id/run           run a predefined template
 *   POST /reports/cohort                      patient cohort analysis
 *   GET  /reports/schedules                   list scheduled reports
 *   POST /reports/schedules                   create a scheduled report
 *   PATCH/DELETE /reports/schedules/:id       update / remove a schedule
 *   GET  /reports/schedules/:id/runs          recent run history
 *   GET  /reports/dashboards                  list dashboards (own + shared)
 *   PUT  /reports/dashboards/:id?             create / replace a dashboard
 *   DELETE /reports/dashboards/:id            remove a dashboard
 *   POST /reports/dashboards/:id/widgets/:key/data   resolve one widget
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { AuditService } from '../../audit/audit.service';
import { describeDataSources } from './datasources';
import { REPORT_TEMPLATES, getReportTemplate } from './report-templates';
import { runQuery, QueryValidationError, type QueryDefinition } from './query-builder.service';
import { analyzeCohort } from './cohort-analysis.service';
import { rowsToCsv } from './report-export';
import {
  ReportScheduleModel,
  ReportRunModel,
  computeNextRun,
} from '../models/report-schedule.model';
import { DashboardModel } from '../models/dashboard-widget.model';
import {
  runQuerySchema,
  runTemplateSchema,
  cohortSchema,
  createScheduleSchema,
  updateScheduleSchema,
  upsertDashboardSchema,
} from './analytics.validation';

const router = Router();
router.use(authenticate, requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

/** Translate compiler validation errors into 400s, everything else to next(). */
function handleQueryError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof QueryValidationError) {
    return res.status(400).json({ error: 'InvalidQuery', message: err.message });
  }
  return next(err);
}

/** Merge a template's canned query with a run-time window + overrides. */
function templateToQuery(
  templateId: string,
  from?: string,
  to?: string,
  overrides?: Record<string, unknown>
): QueryDefinition {
  const template = getReportTemplate(templateId);
  if (!template) throw new QueryValidationError(`Unknown template "${templateId}"`);
  return { ...template.query, ...(overrides ?? {}), from, to } as QueryDefinition;
}

// ── Catalogue ────────────────────────────────────────────────────────────────
router.get(
  '/datasources',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'success', data: describeDataSources() });
  })
);

router.get(
  '/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: REPORT_TEMPLATES.map(({ id, name, description, category, visualization }) => ({
        id,
        name,
        description,
        category,
        visualization,
      })),
    });
  })
);

// ── Ad-hoc custom query ──────────────────────────────────────────────────────
router.post(
  '/query',
  validateRequest({ body: runQuerySchema }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runQuery(req.body.query as QueryDefinition, req.user!.clinicId);
      const wantsCsv = req.query.format === 'csv';
      if (wantsCsv) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
        return res.send(rowsToCsv(result.rows));
      }
      return res.json({ status: 'success', data: result });
    } catch (err) {
      return handleQueryError(err, res, next);
    }
  })
);

// ── Predefined template run ──────────────────────────────────────────────────
router.post(
  '/templates/:id/run',
  validateRequest({ body: runTemplateSchema.partial() }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = templateToQuery(
        req.params.id,
        req.body?.from,
        req.body?.to,
        req.body?.overrides
      );
      const result = await runQuery(query, req.user!.clinicId);
      return res.json({ status: 'success', data: { templateId: req.params.id, ...result } });
    } catch (err) {
      return handleQueryError(err, res, next);
    }
  })
);

// ── Cohort analysis ─────────────────────────────────────────────────────────
router.post(
  '/cohort',
  validateRequest({ body: cohortSchema }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await analyzeCohort(req.body, req.user!.clinicId);
      return res.json({ status: 'success', data: result });
    } catch (err) {
      return handleQueryError(err, res, next);
    }
  })
);

// ── Scheduled reports ───────────────────────────────────────────────────────
router.get(
  '/schedules',
  asyncHandler(async (req: Request, res: Response) => {
    const schedules = await ReportScheduleModel.find({ clinicId: req.user!.clinicId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ status: 'success', data: schedules });
  })
);

router.post(
  '/schedules',
  validateRequest({ body: createScheduleSchema }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body;
    try {
      // Validate the template / query up front so a broken schedule never lands.
      if (body.templateId) templateToQuery(body.templateId);
    } catch (err) {
      return handleQueryError(err, res, next);
    }

    const hourUtc = body.hourUtc ?? 6;
    const schedule = await ReportScheduleModel.create({
      clinicId: req.user!.clinicId,
      name: body.name,
      templateId: body.templateId,
      query: body.query,
      cadence: body.cadence,
      hourUtc,
      windowDays: body.windowDays ?? 30,
      format: body.format ?? 'json',
      recipients: body.recipients ?? [],
      isActive: true,
      nextRunAt: computeNextRun(body.cadence, hourUtc),
      createdBy: req.user!.userId,
    });

    await AuditService.log(
      {
        action: 'REPORT_SCHEDULE_CREATE',
        resourceType: 'ReportSchedule',
        resourceId: String(schedule._id),
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        outcome: 'SUCCESS',
        metadata: { name: body.name, cadence: body.cadence },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: schedule });
  })
);

router.patch(
  '/schedules/:id',
  validateRequest({ body: updateScheduleSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await ReportScheduleModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
    }

    const updates = req.body as Record<string, unknown>;
    Object.assign(existing, updates);
    if (updates.cadence || updates.hourUtc !== undefined) {
      existing.nextRunAt = computeNextRun(existing.cadence, existing.hourUtc);
    }
    await existing.save();

    return res.json({ status: 'success', data: existing.toObject() });
  })
);

router.delete(
  '/schedules/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await ReportScheduleModel.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!deleted) {
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
    }
    await ReportRunModel.deleteMany({ scheduleId: deleted._id });
    return res.json({ status: 'success', data: { id: req.params.id, deleted: true } });
  })
);

router.get(
  '/schedules/:id/runs',
  asyncHandler(async (req: Request, res: Response) => {
    const schedule = await ReportScheduleModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    }).lean();
    if (!schedule) {
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
    }
    const runs = await ReportRunModel.find({ scheduleId: schedule._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ status: 'success', data: runs });
  })
);

// ── Dashboards & widgets ────────────────────────────────────────────────────
router.get(
  '/dashboards',
  asyncHandler(async (req: Request, res: Response) => {
    const dashboards = await DashboardModel.find({
      clinicId: req.user!.clinicId,
      $or: [{ ownerId: req.user!.userId }, { shared: true }],
    })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ status: 'success', data: dashboards });
  })
);

router.put(
  '/dashboards/:id?',
  validateRequest({ body: upsertDashboardSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, shared, widgets } = req.body;

    // Reject duplicate widget keys — they must be addressable individually.
    const keys = new Set<string>();
    for (const w of widgets) {
      if (keys.has(w.key)) {
        return res
          .status(400)
          .json({ error: 'InvalidDashboard', message: `Duplicate widget key "${w.key}"` });
      }
      keys.add(w.key);
    }

    if (req.params.id) {
      const updated = await DashboardModel.findOneAndUpdate(
        { _id: req.params.id, clinicId: req.user!.clinicId, ownerId: req.user!.userId },
        { $set: { name, shared: !!shared, widgets } },
        { new: true }
      ).lean();
      if (!updated) {
        return res
          .status(404)
          .json({ error: 'NotFound', message: 'Dashboard not found or not owned by you' });
      }
      return res.json({ status: 'success', data: updated });
    }

    const created = await DashboardModel.create({
      clinicId: req.user!.clinicId,
      ownerId: req.user!.userId,
      name,
      shared: !!shared,
      widgets,
    });
    return res.status(201).json({ status: 'success', data: created.toObject() });
  })
);

router.delete(
  '/dashboards/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await DashboardModel.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      ownerId: req.user!.userId,
    });
    if (!deleted) {
      return res.status(404).json({ error: 'NotFound', message: 'Dashboard not found' });
    }
    return res.json({ status: 'success', data: { id: req.params.id, deleted: true } });
  })
);

router.post(
  '/dashboards/:id/widgets/:key/data',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const dashboard = await DashboardModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      $or: [{ ownerId: req.user!.userId }, { shared: true }],
    }).lean();
    if (!dashboard) {
      return res.status(404).json({ error: 'NotFound', message: 'Dashboard not found' });
    }

    const widget = dashboard.widgets.find((w) => w.key === req.params.key);
    if (!widget) {
      return res.status(404).json({ error: 'NotFound', message: 'Widget not found' });
    }

    const to = new Date();
    const from = new Date(to.getTime() - (widget.windowDays ?? 30) * 86400_000);

    try {
      const query: QueryDefinition = widget.templateId
        ? templateToQuery(widget.templateId, from.toISOString(), to.toISOString())
        : ({
            ...(widget.query as object),
            from: from.toISOString(),
            to: to.toISOString(),
          } as QueryDefinition);
      const result = await runQuery(query, req.user!.clinicId);
      return res.json({
        status: 'success',
        data: { key: widget.key, visualization: widget.visualization, ...result },
      });
    } catch (err) {
      return handleQueryError(err, res, next);
    }
  })
);

export const analyticsRoutes = router;
