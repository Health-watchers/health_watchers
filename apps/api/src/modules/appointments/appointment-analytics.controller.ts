import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { getAppointmentAnalytics } from './appointment-analytics.service';

const analyticsQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  doctorId: z.string().optional(),
});

const router = Router();
router.use(authenticate);
router.use(requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN', 'DOCTOR'));

/**
 * GET /appointment-analytics
 * Returns analytics for the clinic over the requested date range.
 *
 * Query parameters:
 *   dateFrom  – ISO 8601 start date (defaults to 30 days ago)
 *   dateTo    – ISO 8601 end date   (defaults to now)
 *   doctorId  – optional filter to a single doctor
 */
router.get(
  '/',
  validateRequest({ query: analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const { dateFrom, dateTo, doctorId } = req.query as {
      dateFrom?: string;
      dateTo?: string;
      doctorId?: string;
    };

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = dateFrom ? new Date(dateFrom) : defaultFrom;
    const to = dateTo ? new Date(dateTo) : now;

    if (from > to) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'dateFrom must be before dateTo',
      });
    }

    const result = await getAppointmentAnalytics(clinicId, from, to, doctorId);

    return res.json({
      status: 'success',
      data: result,
      meta: {
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
        clinicId,
        doctorId: doctorId ?? null,
      },
    });
  }),
);

export const appointmentAnalyticsRoutes = router;
