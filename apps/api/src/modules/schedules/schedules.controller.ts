
import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { StaffScheduleModel } from './models/staff-schedule.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createStaffScheduleSchema,
  updateStaffScheduleSchema,
  staffScheduleIdParamsSchema,
  getStaffSchedulesQuerySchema,
} from './schedules.validation';
import { checkScheduleConflict, isStaffAvailable, isScheduleInDateRange } from './schedules.service';

export const scheduleRoutes = Router();
scheduleRoutes.use(authenticate);

// ── POST /schedules/staff ─────────────────────────────────────────────────────
scheduleRoutes.post(
  '/staff',
  validateRequest({ body: createStaffScheduleSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { 
        userId, 
        date, 
        dayOfWeek, 
        startTime, 
        endTime, 
        isAvailable, 
        recurrence, 
        recurrenceEndDate, 
        notes 
      } = req.body;

      const hasConflict = await checkScheduleConflict(
        userId,
        clinicId,
        startTime,
        endTime,
        date ? new Date(date) : undefined,
        dayOfWeek,
        recurrence,
      );

      if (hasConflict) {
        return res.status(409).json({
          error: 'ScheduleConflict',
          message: 'Schedule conflicts with an existing one',
        });
      }

      const schedule = await StaffScheduleModel.create({
        userId: new Types.ObjectId(userId),
        clinicId: new Types.ObjectId(clinicId),
        date: date ? new Date(date) : undefined,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable,
        recurrence,
        recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
        notes,
      });

      return res.status(201).json({ status: 'success', data: schedule });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /schedules/staff ─────────────────────────────────────────────────────
scheduleRoutes.get(
  '/staff',
  validateRequest({ query: getStaffSchedulesQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { userId, dateFrom, dateTo, dayOfWeek } = req.query as any;

      const filter: Record<string, unknown> = { clinicId };
      if (userId) filter.userId = new Types.ObjectId(userId);
      if (dayOfWeek !== undefined) filter.dayOfWeek = dayOfWeek;

      let schedules = await StaffScheduleModel.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      // Filter by date range if provided
      if (dateFrom || dateTo) {
        const from = dateFrom ? new Date(dateFrom) : new Date(0);
        const to = dateTo ? new Date(dateTo) : new Date(8640000000000000);
        schedules = schedules.filter(schedule => 
          isScheduleInDateRange(schedule, from, to)
        );
      }

      return res.json({ status: 'success', data: schedules });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /schedules/staff/:id ──────────────────────────────────────────────────
scheduleRoutes.get(
  '/staff/:id',
  validateRequest({ params: staffScheduleIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const schedule = await StaffScheduleModel.findOne({
        _id: req.params.id,
        clinicId,
      }).lean();

      if (!schedule) {
        return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
      }

      return res.json({ status: 'success', data: schedule });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── PUT /schedules/staff/:id ──────────────────────────────────────────────────
scheduleRoutes.put(
  '/staff/:id',
  validateRequest({ 
    params: staffScheduleIdParamsSchema, 
    body: updateStaffScheduleSchema 
  }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const existing = await StaffScheduleModel.findOne({
        _id: req.params.id,
        clinicId,
      });
      
      if (!existing) {
        return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.date) updateData.date = new Date(req.body.date);
      if (req.body.dayOfWeek !== undefined) updateData.dayOfWeek = req.body.dayOfWeek;
      if (req.body.startTime) updateData.startTime = req.body.startTime;
      if (req.body.endTime) updateData.endTime = req.body.endTime;
      if (req.body.isAvailable !== undefined) updateData.isAvailable = req.body.isAvailable;
      if (req.body.recurrence) updateData.recurrence = req.body.recurrence;
      if (req.body.recurrenceEndDate) updateData.recurrenceEndDate = new Date(req.body.recurrenceEndDate);
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;

      // Check for conflicts if we're updating time-related fields
      const hasTimeChange = req.body.startTime || req.body.endTime || req.body.date !== undefined || req.body.dayOfWeek !== undefined;
      if (hasTimeChange) {
        const hasConflict = await checkScheduleConflict(
          String(existing.userId),
          clinicId,
          req.body.startTime || existing.startTime,
          req.body.endTime || existing.endTime,
          req.body.date ? new Date(req.body.date) : existing.date,
          req.body.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.dayOfWeek,
          req.body.recurrence || existing.recurrence,
          req.params.id,
        );

        if (hasConflict) {
          return res.status(409).json({
            error: 'ScheduleConflict',
            message: 'Updated schedule conflicts with an existing one',
          });
        }
      }

      const updated = await StaffScheduleModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).lean();

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── DELETE /schedules/staff/:id ─────────────────────────────────────────────────
scheduleRoutes.delete(
  '/staff/:id',
  validateRequest({ params: staffScheduleIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const deleted = await StaffScheduleModel.findOneAndDelete({
        _id: req.params.id,
        clinicId,
      });

      if (!deleted) {
        return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
      }

      return res.json({ status: 'success', data: deleted });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /schedules/staff/availability/:userId ──────────────────────────────────
scheduleRoutes.get(
  '/staff/availability/:userId',
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { userId } = req.params;
      const { dateTime, duration } = req.query as any;

      const date = dateTime ? new Date(dateTime) : new Date();
      const dur = duration ? Number(duration) : 30;

      const available = await isStaffAvailable(userId, clinicId, date, dur);

      return res.json({ 
        status: 'success', 
        data: { available, dateTime: date.toISOString(), duration: dur } 
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);
