import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppointmentModel } from './appointment.model';
import { toAppointmentResponse } from './appointments.transformer';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  cancelAppointmentSchema,
  listAppointmentsQuerySchema,
  availabilityQuerySchema,
  appointmentIdParamsSchema,
  doctorIdParamsSchema,
  videoStartSchema,
} from './appointments.validation';
import { withOutboxTransaction, OutboxEventInput } from '../outbox/outbox.service';
import type { OutboxTarget } from '../outbox/outbox-event.model';
import { NotificationModel } from '../notifications/notification.model';
import { notifyNextOnWaitlist } from './waitlist.service';
import { emitToUser } from '@api/realtime/socket';
import { isStaffAvailable } from '../schedules/schedules.service';

export const appointmentRoutes = Router();
appointmentRoutes.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hasConflict(
  doctorId: string,
  scheduledAt: Date,
  duration: number,
  excludeId?: string,
): Promise<boolean> {
  const proposedEnd = new Date(scheduledAt.getTime() + duration * 60_000);

  // Fetch only scheduled/confirmed appointments for this doctor
  // that could potentially overlap — we avoid $expr to prevent
  // user-controlled data from influencing query operators.
  const filter: Record<string, unknown> = {
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledAt: { $lt: proposedEnd },
  };

  if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };

  const candidates = await AppointmentModel.find(filter)
    .select('scheduledAt duration')
    .lean();

  // Check overlap in JS — no user-controlled operators in the query
  return candidates.some((appt) => {
    const apptEnd = new Date(
      new Date(appt.scheduledAt).getTime() + appt.duration * 60_000,
    );
    return apptEnd > scheduledAt;
  });
}

const STATUS_SOCKET_EVENTS: Record<string, string> = {
  confirmed: 'appointment:confirmed',
  cancelled: 'appointment:cancelled',
  rescheduled: 'appointment:rescheduled',
  patient_arrived: 'appointment:patient_arrived',
};

const STATUS_WEBHOOK_EVENTS: Record<string, string> = {
  scheduled: 'appointment.created',
  cancelled: 'appointment.cancelled',
};

/**
 * Build the outbox event for an appointment status change (#1432): the
 * Socket.IO updates to the appointment and clinic rooms plus, for creation and
 * cancellation, the outbound webhook. Returns null when nothing is published.
 */
function appointmentStatusEvent(
  appointmentId: string,
  status: string,
  appointment: any,
  additionalData?: Record<string, unknown>
): OutboxEventInput | null {
  const clinicId = String(appointment.clinicId);
  const targets: OutboxTarget[] = [];
  const socketEvent = STATUS_SOCKET_EVENTS[status];
  if (socketEvent) {
    targets.push(
      {
        kind: 'socket',
        via: 'socket-service',
        room: 'appointment',
        id: appointmentId,
        event: socketEvent,
        data: { appointment, ...additionalData },
      },
      {
        kind: 'socket',
        via: 'socket-service',
        room: 'clinic',
        id: clinicId,
        event: socketEvent,
        data: { appointmentId, appointment, ...additionalData },
      }
    );
  }
  const webhookEvent = STATUS_WEBHOOK_EVENTS[status];
  if (webhookEvent) targets.push({ kind: 'webhook', event: webhookEvent });
  if (targets.length === 0) return null;

  return {
    type: `appointment.${status}`,
    aggregateType: 'Appointment',
    aggregateId: appointmentId,
    clinicId,
    payload: { appointmentId, status, appointment, ...additionalData },
    targets,
  };
}

// ── POST /appointments/:id/check-in ───────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}/check-in:
 *   post:
 *     summary: Check in a patient for their appointment
 *     description: Marks a confirmed or scheduled appointment as patient_arrived and notifies the assigned doctor.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Patient checked in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: '507f1f77bcf86cd799439020' }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer, example: 30 }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, example: patient_arrived, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                     notes: { type: string, nullable: true }
 *                     checkedInAt: { type: string, format: date-time, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *                 message: { type: string, example: 'Patient checked in successfully' }
 *       400:
 *         description: Appointment is not in a confirmed or scheduled state
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.post(
  '/:id/check-in',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const appointment = await AppointmentModel.findOne({ 
        _id: req.params.id, 
        clinicId 
      });
      
      if (!appointment) {
        return res.status(404).json({ 
          error: 'NotFound', 
          message: 'Appointment not found' 
        });
      }

      if (appointment.status !== 'confirmed' && appointment.status !== 'scheduled') {
        return res.status(400).json({
          error: 'InvalidStatus',
          message: 'Only confirmed or scheduled appointments can be checked in',
        });
      }

      // The status change and its real-time event commit together (#1432).
      const updated = await withOutboxTransaction(async (session, emit) => {
        const doc = await AppointmentModel.findByIdAndUpdate(
          req.params.id,
          {
            status: 'patient_arrived',
            checkedInAt: new Date(),
          },
          { new: true, runValidators: true, session }
        ).lean();
        const event =
          doc &&
          appointmentStatusEvent(req.params.id, 'patient_arrived', doc, {
            checkedInAt: doc.checkedInAt,
          });
        if (event) await emit(event);
        return doc;
      });

      // Create notification for staff
      await NotificationModel.create({
        userId: appointment.doctorId,
        clinicId: appointment.clinicId,
        type: 'appointment_status_update',
        title: 'Patient Checked In',
        message: `Patient has checked in for their appointment`,
        metadata: {
          appointmentId: appointment._id,
          status: 'patient_arrived',
        },
      });

      return res.json({ 
        status: 'success', 
        data: toAppointmentResponse(updated, req.user!.role),
        message: 'Patient checked in successfully'
      });
    } catch (err: any) {
      return res.status(500).json({ 
        error: 'InternalError', 
        message: err.message 
      });
    }
  },
);

// ── GET /appointments/doctor/:doctorId/availability ───────────────────────────
/**
 * @swagger
 * /appointments/doctor/{doctorId}/availability:
 *   get:
 *     summary: Get a doctor's 30-minute appointment slot availability for a given day
 *     description: Generates slots from 08:00 to 17:00 local time and marks each as available or booked based on existing scheduled/confirmed appointments.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema: { type: string }
 *         description: Doctor's user MongoDB ObjectId
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, pattern: '^\d{4}-\d{2}-\d{2}$', example: '2026-09-15' }
 *         description: Date to check availability for, in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: List of 30-minute slots with availability
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
 *                       time: { type: string, format: date-time }
 *                       available: { type: boolean }
 *       400:
 *         description: Invalid date format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.get(
  '/doctor/:doctorId/availability',
  validateRequest({ params: doctorIdParamsSchema, query: availabilityQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { doctorId } = req.params;
      const { date } = req.query as { date: string };

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const booked = await AppointmentModel.find({
        doctorId: new Types.ObjectId(doctorId),
        status: { $in: ['scheduled', 'confirmed'] },
        scheduledAt: { $gte: dayStart, $lte: dayEnd },
      })
        .select('scheduledAt duration')
        .sort({ scheduledAt: 1 })
        .lean();

      // Generate 30-min slots from 08:00 to 17:00
      const slots: { time: string; available: boolean }[] = [];
      for (let h = 8; h < 17; h++) {
        for (const m of [0, 30]) {
          const slotStart = new Date(date);
          slotStart.setHours(h, m, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

          const occupied = booked.some((appt) => {
            const apptEnd = new Date(
              new Date(appt.scheduledAt).getTime() + appt.duration * 60_000,
            );
            return new Date(appt.scheduledAt) < slotEnd && apptEnd > slotStart;
          });

          slots.push({
            time: slotStart.toISOString(),
            available: !occupied,
          });
        }
      }

      return res.json({ status: 'success', data: slots });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /appointments ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: List appointments for the caller's clinic
 *     description: Patients only see their own appointments (patientId is forced to the caller's ID); other roles may filter by doctorId/patientId.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema: { type: string }
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated list of appointments
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
 *                       id: { type: string }
 *                       patientId: { type: string }
 *                       doctorId: { type: string }
 *                       clinicId: { type: string }
 *                       scheduledAt: { type: string, format: date-time }
 *                       duration: { type: integer, example: 30 }
 *                       type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                       status: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                       notes: { type: string, nullable: true }
 *                       checkedInAt: { type: string, format: date-time, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42 }
 *                     pages: { type: integer, example: 3 }
 *                     totalPages: { type: integer, example: 3 }
 *                     hasNext: { type: boolean }
 *                     hasPrev: { type: boolean }
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
appointmentRoutes.get(
  '/',
  validateRequest({ query: listAppointmentsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, role, userId } = req.user!;
      const { doctorId, patientId, status, dateFrom, dateTo, page, limit } =
        req.query as any;

      const filter: Record<string, unknown> = { clinicId };

      // RBAC: patients can only see their own appointments
      if (role === 'PATIENT') filter.patientId = userId;
      else {
        if (doctorId) filter.doctorId = new Types.ObjectId(doctorId);
        if (patientId) filter.patientId = new Types.ObjectId(patientId);
      }

      if (status) filter.status = status;
      if (dateFrom || dateTo) {
        filter.scheduledAt = {};
        if (dateFrom) (filter.scheduledAt as any).$gte = new Date(dateFrom);
        if (dateTo) (filter.scheduledAt as any).$lte = new Date(dateTo);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [data, total] = await Promise.all([
        AppointmentModel.find(filter)
          .sort({ scheduledAt: 1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        AppointmentModel.countDocuments(filter),
      ]);

      return res.json({
        status: 'success',
        data: data.map((d) => toAppointmentResponse(d, req.user!.role)),
        pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)), totalPages: Math.ceil(total / Number(limit)), hasNext: Number(page) < Math.ceil(total / Number(limit)), hasPrev: Number(page) > 1 },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /appointments/:id ─────────────────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get a single appointment
 *     description: Patients may only fetch their own appointments; other roles are scoped to their clinic.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer, example: 30 }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                     notes: { type: string, nullable: true }
 *                     checkedInAt: { type: string, format: date-time, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.get(
  '/:id',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, role, userId } = req.user!;
      const filter: Record<string, unknown> = { _id: req.params.id, clinicId };
      if (role === 'PATIENT') filter.patientId = userId;

      const appointment = await AppointmentModel.findOne(filter).lean();
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      return res.json({ status: 'success', data: toAppointmentResponse(appointment, req.user!.role) });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments ────────────────────────────────────────────────────────
/**
 * @swagger
 * /appointments:
 *   post:
 *     summary: Create a new appointment
 *     description: Checks the doctor's existing appointments and staff schedule for conflicts before creating.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId, scheduledAt, type]
 *             properties:
 *               patientId: { type: string, example: '507f1f77bcf86cd799439011' }
 *               doctorId: { type: string, example: '507f1f77bcf86cd799439012' }
 *               scheduledAt: { type: string, format: date-time, example: '2026-09-15T14:00:00.000Z' }
 *               duration: { type: integer, minimum: 1, default: 30, description: 'Duration in minutes' }
 *               type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *               chiefComplaint: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Appointment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer, example: 30 }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, example: scheduled, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                     notes: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
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
 *       409:
 *         description: The doctor already has an appointment during this time slot, or is not available per their schedule
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             examples:
 *               timeSlotUnavailable:
 *                 value: { error: TimeSlotUnavailable, message: 'The doctor already has an appointment during this time slot' }
 *               doctorUnavailable:
 *                 value: { error: DoctorUnavailable, message: 'The doctor is not available at this time' }
 */
appointmentRoutes.post(
  '/',
  validateRequest({ body: createAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { patientId, doctorId, scheduledAt, duration, type, chiefComplaint, notes } = req.body;

      const start = new Date(scheduledAt);
      const dur = duration ?? 30;

      if (await hasConflict(doctorId, start, dur)) {
        return res.status(409).json({
          error: 'TimeSlotUnavailable',
          message: 'The doctor already has an appointment during this time slot',
        });
      }

      const available = await isStaffAvailable(doctorId, clinicId, start, dur);
      if (!available) {
        return res.status(409).json({
          error: 'DoctorUnavailable',
          message: 'The doctor is not available at this time',
        });
      }

      // The appointment and its `appointment.created` webhook commit together (#1432).
      const appointment = await withOutboxTransaction(async (session, emit) => {
        const [doc] = await AppointmentModel.create(
          [
            {
              patientId,
              doctorId,
              clinicId,
              scheduledAt: start,
              duration: duration ?? 30,
              type,
              chiefComplaint,
              notes,
            },
          ],
          { session }
        );
        const event = appointmentStatusEvent(doc._id.toString(), 'scheduled', doc.toObject());
        if (event) await emit(event);
        return doc;
      });

      // Create notification for doctor
      await NotificationModel.create({
        userId: doctorId,
        clinicId,
        type: 'appointment_reminder',
        title: 'New Appointment Scheduled',
        message: `A new appointment has been scheduled`,
        metadata: {
          appointmentId: appointment._id,
          status: 'scheduled',
        },
      });

      return res.status(201).json({ status: 'success', data: toAppointmentResponse(appointment, req.user!.role) });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── PUT /appointments/:id ─────────────────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}:
 *   put:
 *     summary: Update an appointment
 *     description: Re-checks for scheduling conflicts if scheduledAt or duration changes, and emits status/reschedule events as applicable.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledAt: { type: string, format: date-time }
 *               duration: { type: integer, minimum: 1 }
 *               type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *               status: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show] }
 *               chiefComplaint: { type: string }
 *               notes: { type: string }
 *               encounterId: { type: string }
 *     responses:
 *       200:
 *         description: Appointment updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                     notes: { type: string, nullable: true }
 *                     checkedInAt: { type: string, format: date-time, nullable: true }
 *                     createdAt: { type: string, format: date-time }
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
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: The doctor already has an appointment during this time slot, or is not available per their schedule
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.put(
  '/:id',
  validateRequest({ params: appointmentIdParamsSchema, body: updateAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const existing = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!existing)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      const { scheduledAt, duration, type, status, chiefComplaint, notes, encounterId } = req.body;

      const newStart = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt;
      const newDuration = duration ?? existing.duration;
      const newDoctorId = String(existing.doctorId);

      if ((scheduledAt || duration) && await hasConflict(newDoctorId, newStart, newDuration, req.params.id)) {
        return res.status(409).json({
          error: 'TimeSlotUnavailable',
          message: 'The doctor already has an appointment during this time slot',
        });
      }

      if (scheduledAt || duration) {
        const available = await isStaffAvailable(newDoctorId, clinicId, newStart, newDuration);
        if (!available) {
          return res.status(409).json({
            error: 'DoctorUnavailable',
            message: 'The doctor is not available at this time',
          });
        }
      }

      const statusChanged = !!status && status !== existing.status;
      const rescheduled = !!scheduledAt && newStart.getTime() !== existing.scheduledAt.getTime();

      // The update and its real-time events commit together (#1432).
      const updated = await withOutboxTransaction(async (session, emit) => {
        const doc = await AppointmentModel.findByIdAndUpdate(
          req.params.id,
          { scheduledAt: newStart, duration: newDuration, type, status, chiefComplaint, notes, encounterId },
          { new: true, runValidators: true, session },
        ).lean();
        if (!doc) return doc;
        const events = [
          statusChanged ? appointmentStatusEvent(req.params.id, status, doc) : null,
          rescheduled
            ? appointmentStatusEvent(req.params.id, 'rescheduled', doc, {
                oldScheduledAt: existing.scheduledAt.toISOString(),
                newScheduledAt: newStart.toISOString(),
              })
            : null,
        ];
        for (const event of events) if (event) await emit(event);
        return doc;
      });

      if (statusChanged) {
        // Create notification
        await NotificationModel.create({
          userId: existing.patientId,
          clinicId: existing.clinicId,
          type: 'appointment_status_update',
          title: 'Appointment Status Updated',
          message: `Your appointment status has been updated to ${status}`,
          metadata: {
            appointmentId: existing._id,
            oldStatus: existing.status,
            newStatus: status,
          },
        });
      }

      return res.json({ status: 'success', data: toAppointmentResponse(updated, req.user!.role) });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── DELETE /appointments/:id (cancel) ─────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}:
 *   delete:
 *     summary: Cancel an appointment
 *     description: Sets status to cancelled, notifies the patient and doctor, and offers the freed slot to the next patient on the waitlist.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancellationReason]
 *             properties:
 *               cancellationReason: { type: string, minLength: 1, example: 'Patient requested reschedule' }
 *     responses:
 *       200:
 *         description: Appointment cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, example: cancelled }
 *                     notes: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error (missing cancellationReason)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.delete(
  '/:id',
  validateRequest({ params: appointmentIdParamsSchema, body: cancelAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      const { cancellationReason } = req.body;

      // The cancellation, its real-time event and the `appointment.cancelled`
      // webhook commit together (#1432).
      const updated = await withOutboxTransaction(async (session, emit) => {
        const doc = await AppointmentModel.findByIdAndUpdate(
          req.params.id,
          {
            status: 'cancelled',
            cancelledBy: new Types.ObjectId(userId),
            cancelledAt: new Date(),
            cancellationReason,
          },
          { new: true, session },
        ).lean();
        const event =
          doc &&
          appointmentStatusEvent(req.params.id, 'cancelled', doc, {
            cancelledBy: userId,
            cancellationReason,
          });
        if (event) await emit(event);
        return doc;
      });

      // Create notifications for both patient and doctor
      const notifications = [
        {
          userId: appointment.patientId,
          title: 'Appointment Cancelled',
          message: `Your appointment has been cancelled. ${cancellationReason || ''}`,
        },
        {
          userId: appointment.doctorId,
          title: 'Appointment Cancelled',
          message: `An appointment has been cancelled. ${cancellationReason || ''}`,
        },
      ];

      await Promise.all(
        notifications.map(notif =>
          NotificationModel.create({
            ...notif,
            clinicId: appointment.clinicId,
            type: 'appointment_status_update',
            metadata: {
              appointmentId: appointment._id,
              cancellationReason,
            },
          })
        )
      );

      // Notify next patient on waitlist (fire-and-forget)
      notifyNextOnWaitlist({
        clinicId:    String(appointment.clinicId),
        doctorId:    String(appointment.doctorId),
        scheduledAt: appointment.scheduledAt,
      }).catch(() => {});

      return res.json({ status: 'success', data: toAppointmentResponse(updated, req.user!.role) });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);


// ── POST /appointments/:id/video-room (create video room) ──────────────────────
/**
 * @swagger
 * /appointments/{id}/video-room:
 *   post:
 *     summary: Create a telemedicine video room for an appointment
 *     description: Provisions a video room with the appointment's configured provider (defaults to daily.co) and marks the appointment as telemedicine.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Video room created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment:
 *                       type: object
 *                       description: Full appointment document (raw, not the trimmed response shape)
 *                       properties:
 *                         _id: { type: string }
 *                         patientId: { type: string }
 *                         doctorId: { type: string }
 *                         clinicId: { type: string }
 *                         isTelemedicine: { type: boolean, example: true }
 *                         videoRoomId: { type: string, example: 'room-9c6b8f2a-...' }
 *                         videoRoomUrl: { type: string, example: 'https://health-watchers.daily.co/room-9c6b8f2a-...' }
 *                         videoProvider: { type: string, enum: [daily.co, jitsi, twilio_video] }
 *                     videoRoom:
 *                       type: object
 *                       properties:
 *                         roomId: { type: string }
 *                         roomUrl: { type: string }
 *                         provider: { type: string, enum: [daily.co, jitsi, twilio_video] }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.post(
  '/:id/video-room',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      const { createVideoRoom } = await import('./telemedicine.service');
      const videoProvider = appointment.videoProvider || 'daily.co';
      const videoRoom = await createVideoRoom(videoProvider);

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        {
          isTelemedicine: true,
          videoRoomId: videoRoom.roomId,
          videoRoomUrl: videoRoom.roomUrl,
          videoProvider: videoRoom.provider,
        },
        { new: true },
      ).lean();

      return res.json({
        status: 'success',
        data: {
          appointment: updated,
          videoRoom,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /appointments/:id/video-token (get video access token) ────────────────
/**
 * @swagger
 * /appointments/{id}/video-token:
 *   get:
 *     summary: Get a video access token for an appointment's video room
 *     description: The video room must already exist (created via POST /appointments/{id}/video-room). Participant name is derived from whether the caller is the assigned doctor.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Video access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string, example: 'daily-token-9c6b8f2a-...' }
 *                     roomId: { type: string }
 *                     provider: { type: string, enum: [daily.co, jitsi, twilio_video] }
 *       400:
 *         description: Video room not created for this appointment
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.get(
  '/:id/video-token',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      if (!appointment.videoRoomId)
        return res.status(400).json({ error: 'BadRequest', message: 'Video room not created' });

      const { generateVideoToken } = await import('./telemedicine.service');
      const participantName = userId === String(appointment.doctorId) ? 'Doctor' : 'Patient';
      const token = await generateVideoToken(
        appointment.videoRoomId,
        participantName,
        appointment.videoProvider || 'daily.co',
      );

      return res.json({ status: 'success', data: token });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments/:id/video/start ────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}/video/start:
 *   post:
 *     summary: Mark a telemedicine video session as started
 *     description: Records the start time and recording consent, then notifies both the doctor and patient over Socket.IO.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recordingConsent: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Video session started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     doctorId: { type: string }
 *                     clinicId: { type: string }
 *                     scheduledAt: { type: string, format: date-time }
 *                     duration: { type: integer }
 *                     type: { type: string, enum: [consultation, follow-up, procedure, emergency] }
 *                     status: { type: string, enum: [scheduled, confirmed, cancelled, completed, no-show, patient_arrived] }
 *                     notes: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Video room not created for this appointment
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.post(
  '/:id/video/start',
  validateRequest({ params: appointmentIdParamsSchema, body: videoStartSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      if (!appointment.isTelemedicine || !appointment.videoRoomId)
        return res.status(400).json({ error: 'BadRequest', message: 'Video room not created for this appointment' });

      const { recordingConsent } = req.body;

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        { videoStartedAt: new Date(), recordingConsent: !!recordingConsent },
        { new: true },
      ).lean();

      // Emit Socket.IO event to both doctor and patient
      const payload = {
        appointmentId: req.params.id,
        videoRoomId: appointment.videoRoomId,
        videoRoomUrl: appointment.videoRoomUrl,
        recordingConsent: !!recordingConsent,
      };
      emitToUser(String(appointment.doctorId), 'appointment:video_started', payload);
      emitToUser(String(appointment.patientId), 'appointment:video_started', payload);

      return res.json({ status: 'success', data: toAppointmentResponse(updated, req.user!.role) });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments/:id/video/end ──────────────────────────────────────────
/**
 * @swagger
 * /appointments/{id}/video/end:
 *   post:
 *     summary: End a telemedicine video session and create an encounter
 *     description: Records the end time and computed duration, marks the appointment completed, notifies both parties over Socket.IO, and creates a telemedicine encounter linked to the appointment.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Video session ended and encounter created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment:
 *                       type: object
 *                       description: Full appointment document (raw, not the trimmed response shape)
 *                       properties:
 *                         _id: { type: string }
 *                         status: { type: string, example: completed }
 *                         videoEndedAt: { type: string, format: date-time }
 *                         videoDuration: { type: integer, description: 'Minutes' }
 *                         encounterId: { type: string }
 *                     encounter:
 *                       type: object
 *                       properties:
 *                         _id: { type: string }
 *                         patientId: { type: string }
 *                         doctorId: { type: string }
 *                         clinicId: { type: string }
 *                         type: { type: string, example: telemedicine }
 *                         status: { type: string, example: open }
 *                         chiefComplaint: { type: string, nullable: true }
 *                         appointmentId: { type: string }
 *       400:
 *         description: Video session was not started
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
appointmentRoutes.post(
  '/:id/video/end',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment)
        return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

      if (!appointment.videoStartedAt)
        return res.status(400).json({ error: 'BadRequest', message: 'Video session not started' });

      const { calculateVideoDuration } = await import('./telemedicine.service');
      const videoEndedAt = new Date();
      const videoDuration = calculateVideoDuration(appointment.videoStartedAt, videoEndedAt);

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        { videoEndedAt, videoDuration, status: 'completed' },
        { new: true },
      ).lean();

      // Emit Socket.IO event to both parties
      const payload = { appointmentId: req.params.id, videoDuration };
      emitToUser(String(appointment.doctorId), 'appointment:video_ended', payload);
      emitToUser(String(appointment.patientId), 'appointment:video_ended', payload);

      // Create encounter from video session
      const { EncounterModel } = await import('../encounters/encounter.model');
      const encounter = await EncounterModel.create({
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        clinicId,
        type: 'telemedicine',
        status: 'open',
        chiefComplaint: appointment.chiefComplaint,
        appointmentId: appointment._id,
        createdBy: userId,
      });

      await AppointmentModel.findByIdAndUpdate(req.params.id, { encounterId: encounter._id });

      return res.json({ status: 'success', data: { appointment: updated, encounter } });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments/bulk (bulk reschedule/cancel) ────────────────────────────
/**
 * @swagger
 * /appointments/bulk:
 *   post:
 *     summary: Bulk reschedule or cancel appointments
 *     description: Reschedule or cancel multiple appointments in bulk for a provider's day
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actions]
 *             properties:
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     appointmentId: { type: string }
 *                     action: { type: string, enum: [reschedule, cancel] }
 *                     rescheduleData:
 *                       type: object
 *                       properties:
 *                         newDoctorId: { type: string }
 *                         newScheduledAt: { type: string, format: date-time }
 *                     cancelReason: { type: string }
 *               dryRun: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Bulk operation results
 */
appointmentRoutes.post(
  '/bulk',
  validateRequest({
    body: z.object({
      actions: z.array(
        z.object({
          appointmentId: z.string(),
          action: z.enum(['reschedule', 'cancel']),
          rescheduleData: z
            .object({
              newDoctorId: z.string().optional(),
              newScheduledAt: z.string().datetime().optional(),
            })
            .optional(),
          cancelReason: z.string().optional(),
        })
      ),
      dryRun: z.boolean().default(false),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const { appointmentsBulkService } = await import('./appointments-bulk.service');

      const actions = req.body.actions.map((a: any) => ({
        ...a,
        rescheduleData: a.rescheduleData ? {
          ...a.rescheduleData,
          newScheduledAt: a.rescheduleData.newScheduledAt ? new Date(a.rescheduleData.newScheduledAt) : undefined,
        } : undefined,
      }));

      if (req.body.dryRun) {
        const conflicts = await appointmentsBulkService.dryRun(actions);
        return res.json({ dryRun: true, conflicts });
      }

      const results = await appointmentsBulkService.executeBulk(actions, userId, clinicId);
      return res.json({ results });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments/check-in/:token (QR check-in) ──────────────────────────
/**
 * @swagger
 * /appointments/check-in/{token}:
 *   post:
 *     summary: Check in using QR code token
 *     description: Patient self check-in using signed token from QR code
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Successfully checked in
 *       400:
 *         description: Token invalid or check-in window closed
 *       404:
 *         description: Appointment not found
 */
appointmentRoutes.post('/check-in/:token', async (req: Request, res: Response) => {
  try {
    const clinicId = req.user?.clinicId || req.query.clinicId;
    if (!clinicId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Clinic ID required' });
    }

    const { qrCheckinService } = await import('./qr-checkin.service');
    const result = await qrCheckinService.validateAndCheckIn(req.params.token, String(clinicId));

    if (!result.success) {
      return res.status(400).json({ error: 'BadRequest', message: result.error });
    }

    // Emit socket event for real-time update
    const { SocketService } = await import('../../services/socket.service');
    const socketService = SocketService.getInstance();
    const appointment = await AppointmentModel.findById(result.appointmentId).lean();

    if (appointment) {
      socketService.emitToClinic(String(appointment.clinicId), 'appointment:checked_in', {
        appointmentId: result.appointmentId,
        patientId: String(appointment.patientId),
      });
    }

    return res.json({ status: 'success', data: { appointmentId: result.appointmentId } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
