import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createBreachIncidentSchema,
  updateBreachIncidentSchema,
  updateBreachIncidentStatusSchema,
} from './breach-incidents.validation';
import {
  createBreachIncident,
  findBreachIncidents,
  findOverdueBreachIncidents,
  generateHhsReport,
  transitionBreachIncidentStatus,
  updateBreachIncident,
} from './breach-incidents.service';

const router = Router();

router.use(authenticate, requireRoles('SUPER_ADMIN'));

router.post(
  '/',
  validateRequest({ body: createBreachIncidentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const incident = await createBreachIncident(req.body, req.user!.userId);
    return res.status(201).json({ status: 'success', data: incident });
  })
);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const incidents = await findBreachIncidents();
    return res.json({ status: 'success', data: incidents });
  })
);

router.get(
  '/overdue',
  asyncHandler(async (_req: Request, res: Response) => {
    const incidents = await findOverdueBreachIncidents();
    return res.json({ status: 'success', data: incidents });
  })
);

router.get(
  '/:id/hhs-report',
  asyncHandler(async (req: Request, res: Response) => {
    const report = await generateHhsReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'NotFound', message: 'Breach incident not found' });
    }
    return res.json({ status: 'success', data: report });
  })
);

router.patch(
  '/:id',
  validateRequest({ body: updateBreachIncidentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const incident = await updateBreachIncident(req.params.id, req.body);
    if (!incident) {
      return res.status(404).json({ error: 'NotFound', message: 'Breach incident not found' });
    }
    return res.json({ status: 'success', data: incident });
  })
);

router.patch(
  '/:id/status',
  validateRequest({ body: updateBreachIncidentStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await transitionBreachIncidentStatus(req.params.id, req.body.notificationStatus);
    if (result.notFound) {
      return res.status(404).json({ error: 'NotFound', message: 'Breach incident not found' });
    }
    if (result.invalidTransition) {
      return res.status(409).json({
        error: 'InvalidStatusTransition',
        message: `Cannot move incident from ${result.invalidTransition} to ${req.body.notificationStatus}`,
      });
    }
    return res.json({ status: 'success', data: result.incident });
  })
);

export const breachIncidentRoutes = router;
