import { Router, Request, Response } from 'express';
import { ScheduleModel } from './models/schedule.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createScheduleSchema,
  updateScheduleSchema,
  listSchedulesQuerySchema,
  coverageCheckSchema,
  CreateScheduleInput,
  UpdateScheduleInput,
  ListSchedulesQuery,
  CoverageCheckInput,
} from './schedules.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate);

function canManageSchedules(role: string): boolean {
  return ['SUPER_ADMIN', 'CLINIC_ADMIN'].includes(role);
}

function canViewSchedules(role: string): boolean {
  return ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT'].includes(role);
}

// POST /schedules — Create schedule entry
router.post(
  '/',
  validateRequest({ body: createScheduleSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!canManageSchedules(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only clinic admins can create schedules',
      });
    }

    const { userId, date, shiftStart, shiftEnd, role, isOnCall, notes } =
      req.body as CreateScheduleInput;
    const clinicId = req.user!.clinicId;

    // Check for overlapping schedules
    const existingSchedule = await ScheduleModel.findOne({
      userId,
      clinicId,
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lt: new Date(date).setHours(23, 59, 59, 999),
      },
      status: { $ne: 'cancelled' },
    });

    if (existingSchedule) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Staff member already has a schedule for this date',
      });
    }

    const schedule = new ScheduleModel({
      userId,
      clinicId,
      date: new Date(date),
      shiftStart,
      shiftEnd,
      role,
      isOnCall,
      notes,
      createdBy: req.user!.id,
    });

    await schedule.save();
    logger.info({ scheduleId: schedule._id, userId, clinicId }, 'Schedule created');

    return res.status(201).json({ status: 'success', data: schedule });
  })
);

// GET /schedules — List schedules
router.get(
  '/',
  validateRequest({ query: listSchedulesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!canViewSchedules(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to view schedules',
      });
    }

    const { userId, startDate, endDate, role, status, page, limit } =
      req.query as unknown as ListSchedulesQuery;
    const clinicId = req.user!.clinicId;

    const filter: Record<string, unknown> = { clinicId };
    if (userId) filter.userId = userId;
    if (role) filter.role = role;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) (filter.date as any).$gte = new Date(startDate);
      if (endDate) (filter.date as any).$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const [schedules, total] = await Promise.all([
      ScheduleModel.find(filter).sort({ date: 1, shiftStart: 1 }).skip(skip).limit(limit).lean(),
      ScheduleModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: schedules,
      meta: { total, page, limit },
    });
  })
);

// PUT /schedules/:id — Update schedule
router.put(
  '/:id',
  validateRequest({ body: updateScheduleSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!canManageSchedules(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only clinic admins can update schedules',
      });
    }

    const { id } = req.params;
    const clinicId = req.user!.clinicId;
    const updates = req.body as UpdateScheduleInput;

    const schedule = await ScheduleModel.findOneAndUpdate(
      { _id: id, clinicId },
      { ...updates, updatedBy: req.user!.id },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Schedule not found',
      });
    }

    logger.info({ scheduleId: id, clinicId }, 'Schedule updated');
    return res.json({ status: 'success', data: schedule });
  })
);

// DELETE /schedules/:id — Cancel schedule
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canManageSchedules(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only clinic admins can delete schedules',
      });
    }

    const { id } = req.params;
    const clinicId = req.user!.clinicId;

    const schedule = await ScheduleModel.findOneAndUpdate(
      { _id: id, clinicId },
      { status: 'cancelled', updatedBy: req.user!.id },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Schedule not found',
      });
    }

    logger.info({ scheduleId: id, clinicId }, 'Schedule cancelled');
    return res.json({ status: 'success', data: schedule });
  })
);

// GET /schedules/coverage — Check coverage for a date
router.get(
  '/coverage',
  validateRequest({ query: coverageCheckSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.query as unknown as CoverageCheckInput;
    const clinicId = req.user!.clinicId;

    const dateObj = new Date(date);
    const schedules = await ScheduleModel.find({
      clinicId,
      date: {
        $gte: dateObj.setHours(0, 0, 0, 0),
        $lt: dateObj.setHours(23, 59, 59, 999),
      },
      status: { $ne: 'cancelled' },
    }).lean();

    const doctors = schedules.filter((s) => s.role === 'DOCTOR');
    const nurses = schedules.filter((s) => s.role === 'NURSE');
    const onCallDoctor = schedules.find((s) => s.role === 'DOCTOR' && s.isOnCall);

    return res.json({
      status: 'success',
      data: {
        date,
        doctorsScheduled: doctors.length,
        nursesScheduled: nurses.length,
        hasMinimumCoverage: doctors.length > 0,
        onCallDoctor: onCallDoctor ? { userId: onCallDoctor.userId, name: onCallDoctor.notes } : null,
        schedules,
      },
    });
  })
);

export const scheduleRoutes = router;
