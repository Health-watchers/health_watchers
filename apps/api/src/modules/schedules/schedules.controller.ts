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
import {
  checkScheduleConflict,
  isStaffAvailable,
  isScheduleInDateRange,
} from './schedules.service';

export const scheduleRoutes = Router();
scheduleRoutes.use(authenticate);

// ── POST /schedules/staff ─────────────────────────────────────────────────────
/**
 * @swagger
 * /schedules/staff:
 *   post:
 *     summary: Create a staff schedule entry
 *     description: A schedule entry is either one-time (date) or recurring (dayOfWeek), never both. Checks for conflicts with existing schedule entries before creating.
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, startTime, endTime]
 *             properties:
 *               userId: { type: string, pattern: '^[0-9a-fA-F]{24}$', example: '507f1f77bcf86cd799439012' }
 *               date: { type: string, format: date, description: 'One-time schedule date (mutually exclusive with dayOfWeek)', example: '2026-09-15' }
 *               dayOfWeek: { type: integer, minimum: 0, maximum: 6, description: 'Recurring schedule day, 0=Sunday (mutually exclusive with date)' }
 *               startTime: { type: string, pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', example: '09:00' }
 *               endTime: { type: string, pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', example: '17:00' }
 *               isAvailable: { type: boolean, default: true }
 *               recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly], default: none }
 *               recurrenceEndDate: { type: string, format: date }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Schedule entry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     userId: { type: string }
 *                     clinicId: { type: string }
 *                     date: { type: string, format: date-time, nullable: true }
 *                     dayOfWeek: { type: integer, nullable: true }
 *                     startTime: { type: string, example: '09:00' }
 *                     endTime: { type: string, example: '17:00' }
 *                     isAvailable: { type: boolean }
 *                     recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly] }
 *                     recurrenceEndDate: { type: string, format: date-time, nullable: true }
 *                     notes: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error (e.g. neither or both of date/dayOfWeek provided, invalid time format)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Schedule conflicts with an existing one
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
        notes,
      } = req.body;

      const hasConflict = await checkScheduleConflict(
        userId,
        clinicId,
        startTime,
        endTime,
        date ? new Date(date) : undefined,
        dayOfWeek,
        recurrence
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
  }
);

// ── GET /schedules/staff ─────────────────────────────────────────────────────
/**
 * @swagger
 * /schedules/staff:
 *   get:
 *     summary: List staff schedule entries for the caller's clinic
 *     description: Optionally filter by userId, dayOfWeek, and/or a date range (dateFrom/dateTo are applied in-memory against each entry's effective date range).
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string }
 *       - in: query
 *         name: dayOfWeek
 *         schema: { type: integer, minimum: 0, maximum: 6 }
 *     responses:
 *       200:
 *         description: List of schedule entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       userId: { type: string }
 *                       clinicId: { type: string }
 *                       date: { type: string, format: date-time, nullable: true }
 *                       dayOfWeek: { type: integer, nullable: true }
 *                       startTime: { type: string }
 *                       endTime: { type: string }
 *                       isAvailable: { type: boolean }
 *                       recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly] }
 *                       recurrenceEndDate: { type: string, format: date-time, nullable: true }
 *                       notes: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

      let schedules = await StaffScheduleModel.find(filter).sort({ createdAt: -1 }).lean();

      // Filter by date range if provided
      if (dateFrom || dateTo) {
        const from = dateFrom ? new Date(dateFrom) : new Date(0);
        const to = dateTo ? new Date(dateTo) : new Date(8640000000000000);
        schedules = schedules.filter((schedule) => isScheduleInDateRange(schedule, from, to));
      }

      return res.json({ status: 'success', data: schedules });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── GET /schedules/staff/:id ──────────────────────────────────────────────────
/**
 * @swagger
 * /schedules/staff/{id}:
 *   get:
 *     summary: Get a single staff schedule entry
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *         description: Schedule entry MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Schedule entry details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     userId: { type: string }
 *                     clinicId: { type: string }
 *                     date: { type: string, format: date-time, nullable: true }
 *                     dayOfWeek: { type: integer, nullable: true }
 *                     startTime: { type: string }
 *                     endTime: { type: string }
 *                     isAvailable: { type: boolean }
 *                     recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly] }
 *                     recurrenceEndDate: { type: string, format: date-time, nullable: true }
 *                     notes: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid schedule ID
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Schedule not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
  }
);

// ── PUT /schedules/staff/:id ──────────────────────────────────────────────────
/**
 * @swagger
 * /schedules/staff/{id}:
 *   put:
 *     summary: Update a staff schedule entry
 *     description: Re-checks for conflicts against other schedule entries when startTime, endTime, date, or dayOfWeek changes.
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *         description: Schedule entry MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *               date: { type: string, format: date }
 *               dayOfWeek: { type: integer, minimum: 0, maximum: 6 }
 *               startTime: { type: string, pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }
 *               endTime: { type: string, pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }
 *               isAvailable: { type: boolean }
 *               recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly] }
 *               recurrenceEndDate: { type: string, format: date }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Schedule entry updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     userId: { type: string }
 *                     clinicId: { type: string }
 *                     date: { type: string, format: date-time, nullable: true }
 *                     dayOfWeek: { type: integer, nullable: true }
 *                     startTime: { type: string }
 *                     endTime: { type: string }
 *                     isAvailable: { type: boolean }
 *                     recurrence: { type: string, enum: [none, daily, weekly, biweekly, monthly] }
 *                     recurrenceEndDate: { type: string, format: date-time, nullable: true }
 *                     notes: { type: string, nullable: true }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Schedule not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Updated schedule conflicts with an existing one
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
scheduleRoutes.put(
  '/staff/:id',
  validateRequest({
    params: staffScheduleIdParamsSchema,
    body: updateStaffScheduleSchema,
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
      if (req.body.recurrenceEndDate)
        updateData.recurrenceEndDate = new Date(req.body.recurrenceEndDate);
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;

      // Check for conflicts if we're updating time-related fields
      const hasTimeChange =
        req.body.startTime ||
        req.body.endTime ||
        req.body.date !== undefined ||
        req.body.dayOfWeek !== undefined;
      if (hasTimeChange) {
        const hasConflict = await checkScheduleConflict(
          String(existing.userId),
          clinicId,
          req.body.startTime || existing.startTime,
          req.body.endTime || existing.endTime,
          req.body.date ? new Date(req.body.date) : existing.date,
          req.body.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.dayOfWeek,
          req.body.recurrence || existing.recurrence,
          req.params.id
        );

        if (hasConflict) {
          return res.status(409).json({
            error: 'ScheduleConflict',
            message: 'Updated schedule conflicts with an existing one',
          });
        }
      }

      const updated = await StaffScheduleModel.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      }).lean();

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── DELETE /schedules/staff/:id ─────────────────────────────────────────────────
/**
 * @swagger
 * /schedules/staff/{id}:
 *   delete:
 *     summary: Delete a staff schedule entry
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
 *         description: Schedule entry MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Schedule entry deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     userId: { type: string }
 *                     clinicId: { type: string }
 *                     startTime: { type: string }
 *                     endTime: { type: string }
 *       400:
 *         description: Invalid schedule ID
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Schedule not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
  }
);

// ── GET /schedules/staff/availability/:userId ──────────────────────────────────
/**
 * @swagger
 * /schedules/staff/availability/{userId}:
 *   get:
 *     summary: Check whether a staff member is available at a given date/time
 *     description: Checks the staff member's schedule entries (one-time and recurring) for the requested date/time and duration.
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: Staff member's user MongoDB ObjectId
 *       - in: query
 *         name: dateTime
 *         schema: { type: string, format: date-time, example: '2026-09-15T14:00:00.000Z' }
 *         description: Defaults to the current date/time if omitted
 *       - in: query
 *         name: duration
 *         schema: { type: integer, default: 30, description: 'Duration in minutes' }
 *     responses:
 *       200:
 *         description: Availability check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     available: { type: boolean }
 *                     dateTime: { type: string, format: date-time }
 *                     duration: { type: integer, example: 30 }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
scheduleRoutes.get('/staff/availability/:userId', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const { userId } = req.params;
    const { dateTime, duration } = req.query as any;

    const date = dateTime ? new Date(dateTime) : new Date();
    const dur = duration ? Number(duration) : 30;

    const available = await isStaffAvailable(userId, clinicId, date, dur);

    return res.json({
      status: 'success',
      data: { available, dateTime: date.toISOString(), duration: dur },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
