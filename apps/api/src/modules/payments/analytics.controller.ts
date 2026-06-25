import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize, Roles } from '@api/middlewares/rbac.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { getPaymentAnalytics } from './services/analytics.service';

const analyticsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('month'),
  clinicId: z.string().optional(), // SUPER_ADMIN only: compare a specific clinic
});

type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const ALLOWED_ROLES = [
  Roles.SUPER_ADMIN,
  Roles.CLINIC_ADMIN,
  Roles.DOCTOR,
  Roles.NURSE,
  Roles.ASSISTANT,
  Roles.READ_ONLY,
];

function resolveClinicId(req: Request, queryClinidId?: string): string {
  return req.user!.role === 'SUPER_ADMIN' && queryClinidId ? queryClinidId : req.user!.clinicId;
}

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /payments/analytics:
 *   get:
 *     summary: Get payment analytics with date range filtering
 *     description: >
 *       Returns aggregated payment analytics including revenue by period, success rate,
 *       asset distribution, and fee costs. SUPER_ADMIN can pass a `clinicId` query param
 *       to retrieve analytics for any clinic.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of date range (ISO 8601). Defaults to 30 days ago.
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of date range (ISO 8601). Defaults to now.
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: month
 *         description: Time granularity for the revenueByPeriod breakdown.
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *         description: >
 *           (SUPER_ADMIN only) Target clinic ID. Ignored for non-super-admin users.
 *     responses:
 *       200:
 *         description: Payment analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/PaymentAnalytics'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/analytics',
  authorize(ALLOWED_ROLES),
  validateRequest({ query: analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as AnalyticsQuery;

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const clinicId = resolveClinicId(req, q.clinicId);

    const data = await getPaymentAnalytics(clinicId, from, to, q.groupBy);

    return res.json({ status: 'success', data });
  })
);

/**
 * @swagger
 * /payments/analytics/export:
 *   get:
 *     summary: Export payment analytics as CSV
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [day, week, month], default: month }
 *       - in: query
 *         name: clinicId
 *         schema: { type: string }
 *         description: SUPER_ADMIN only
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
  '/analytics/export',
  authorize(ALLOWED_ROLES),
  validateRequest({ query: analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as AnalyticsQuery;

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const clinicId = resolveClinicId(req, q.clinicId);

    const data = await getPaymentAnalytics(clinicId, from, to, q.groupBy);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const filename = `payment-analytics_${fromStr}_${toStr}.csv`;

    const header = 'Period,XLM Amount,USDC Amount,USD Equivalent,Transaction Count';
    const rows = data.revenueByPeriod.map(
      (p) => `"${p.period}","${p.xlm}","${p.usdc}","${p.usdEquivalent}",${p.count}`
    );
    const summary = [
      '',
      `"Total","${data.totalRevenue.xlm}","${data.totalRevenue.usdc}","${data.totalRevenue.usdEquivalent}",${data.transactionCount.total}`,
      `"Success Rate","${data.successRate}%","","",""`,
    ];

    const csv = [header, ...rows, ...summary].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  })
);

export const analyticsRoutes = router;

