import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { auditLog } from '../audit/audit.service';
import {
  PortalPaymentError,
  addCard,
  assignCardToPlan,
  cardLabel,
  changePlanStatus,
  getPatientPlan,
  listCards,
  listPatientPlans,
  paginateHistory,
  removeCard,
  sendPlanChangeEmail,
  setDefaultCard,
  summarisePlan,
  type PatientScope,
  type PlanAction,
} from './portal-payments.service';

/**
 * Patient portal — recurring payments & saved cards (#1690)
 *
 *  GET    /portal/payments/recurring                       List the patient's recurring plans
 *  GET    /portal/payments/recurring/:id                   Plan detail
 *  GET    /portal/payments/recurring/:id/history           Paginated payment history
 *  POST   /portal/payments/recurring/:id/pause             Pause an active plan
 *  POST   /portal/payments/recurring/:id/resume            Resume a paused plan
 *  POST   /portal/payments/recurring/:id/cancel            Cancel a plan
 *  PUT    /portal/payments/recurring/:id/payment-method    Charge the plan to another saved card
 *  GET    /portal/payments/methods                         Saved cards
 *  POST   /portal/payments/methods                         Save a tokenized card
 *  PATCH  /portal/payments/methods/:id/default             Make a card the default
 *  DELETE /portal/payments/methods/:id                     Remove a card
 *
 * Every plan change emails the patient a confirmation.
 */
const router = Router();
router.use(authenticate, requireRoles('PATIENT'));

function scopeOf(req: Request): PatientScope {
  return {
    patientId: String(req.user!.patientId),
    clinicId: String(req.user!.clinicId),
    userId: String(req.user!.userId),
  };
}

async function patientContact(req: Request) {
  const [user, patient] = await Promise.all([
    UserModel.findById(req.user!.userId, { email: 1, fullName: 1, preferences: 1 }).lean(),
    PatientModel.findById(req.user!.patientId, { firstName: 1, lastName: 1 }).lean(),
  ]);
  const name =
    [(patient as any)?.firstName, (patient as any)?.lastName].filter(Boolean).join(' ') ||
    (user as any)?.fullName ||
    '';
  return { email: (user as any)?.email as string | undefined, name };
}

async function audit(req: Request, resourceId: string, metadata: Record<string, unknown>) {
  await auditLog(
    {
      action: 'MUTATION_UPDATE',
      resourceType: 'RecurringPayment',
      resourceId,
      userId: req.user?.userId,
      clinicId: req.user?.clinicId,
      outcome: 'SUCCESS',
      metadata: { source: 'patient_portal', ...metadata },
    },
    req
  );
}

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
});

const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() });

const addCardSchema = z.object({
  processorToken: z.string().min(1),
  brand: z.string().min(1),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int(),
  expYear: z.number().int(),
  cardholderName: z.string().trim().max(100).optional(),
  makeDefault: z.boolean().optional(),
});

const assignCardSchema = z.object({ paymentMethodId: z.string().min(1) });

// ── Recurring plans ───────────────────────────────────────────────────────────

router.get(
  '/recurring',
  asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    return res.json({ status: 'success', data: await listPatientPlans(scopeOf(req), status) });
  })
);

router.get(
  '/recurring/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await getPatientPlan(scopeOf(req), req.params.id);
    return res.json({
      status: 'success',
      data: {
        ...summarisePlan(plan),
        cancellationReason: (plan as any).cancellationReason,
        changeLog: ((plan as any).changeLog ?? []).map((c: any) => ({
          action: c.action,
          at: c.at,
          byRole: c.byRole,
          reason: c.reason,
        })),
      },
    });
  })
);

router.get(
  '/recurring/:id/history',
  validateRequest({ query: historyQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, status } = req.query as unknown as z.infer<typeof historyQuerySchema>;
    const plan = await getPatientPlan(scopeOf(req), req.params.id);
    const { items, meta } = paginateHistory(plan, Number(page), Number(limit), status);
    return res.json({ status: 'success', data: items, meta });
  })
);

for (const action of ['pause', 'resume', 'cancel'] as PlanAction[]) {
  router.post(
    `/recurring/:id/${action}`,
    validateRequest({ body: reasonSchema }),
    asyncHandler(async (req: Request, res: Response) => {
      const reason = (req.body as z.infer<typeof reasonSchema>).reason || undefined;
      const { plan, from } = await changePlanStatus(scopeOf(req), req.params.id, action, reason);

      const contact = await patientContact(req);
      const change = action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'cancelled';
      const emailSent = await sendPlanChangeEmail(contact.email, {
        patientName: contact.name,
        plan: { ...(plan as any).toObject(), nextPaymentDate: plan.status === 'active' ? plan.nextPaymentDate : null },
        change,
        reason,
      });
      await audit(req, String(plan._id), { statusChange: `${from} → ${plan.status}`, reason });

      return res.json({ status: 'success', data: summarisePlan(plan), meta: { emailSent } });
    })
  );
}

router.put(
  '/recurring/:id/payment-method',
  validateRequest({ body: assignCardSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { plan, card, changed } = await assignCardToPlan(
      scopeOf(req),
      req.params.id,
      req.body.paymentMethodId
    );
    let emailSent = false;
    if (changed) {
      const contact = await patientContact(req);
      emailSent = await sendPlanChangeEmail(contact.email, {
        patientName: contact.name,
        plan: (plan as any).toObject(),
        change: 'payment_method_changed',
        cardLabel: cardLabel(card),
      });
      await audit(req, String(plan._id), { paymentMethodChanged: String(card._id) });
    }
    return res.json({ status: 'success', data: summarisePlan(plan), meta: { emailSent } });
  })
);

// ── Saved cards ───────────────────────────────────────────────────────────────

router.get(
  '/methods',
  asyncHandler(async (req: Request, res: Response) => {
    return res.json({ status: 'success', data: await listCards(scopeOf(req)) });
  })
);

router.post(
  '/methods',
  validateRequest({ body: addCardSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const card = await addCard(scopeOf(req), req.body);
    return res.status(201).json({ status: 'success', data: card });
  })
);

router.patch(
  '/methods/:id/default',
  asyncHandler(async (req: Request, res: Response) => {
    return res.json({ status: 'success', data: await setDefaultCard(scopeOf(req), req.params.id) });
  })
);

router.delete(
  '/methods/:id',
  asyncHandler(async (req: Request, res: Response) => {
    return res.json({ status: 'success', data: await removeCard(scopeOf(req), req.params.id) });
  })
);

// Map service errors to their HTTP status; anything else falls through to the global handler.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof PortalPaymentError) {
    return res
      .status(err.status)
      .json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  return next(err);
});

export const portalPaymentsRoutes = router;
