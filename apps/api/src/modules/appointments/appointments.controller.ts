import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
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
} from './appointments.validation';

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

  const query: Record<string, unknown> = {
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledAt: { $lt: proposedEnd },
    $expr: {
      $gt: [
        { $add: ['$scheduledAt', { $multiply: ['$duration', 60_000] }] },
        scheduledAt.getTime(),
      ],
    },
  };

  if (excludeId) query._id = { $ne: new Types.ObjectId(excludeId) };

  return (await AppointmentModel.countDocuments(query)) > 0;
}

// ── GET /appointments/doctor/:doctorId/availability ───────────────────────────
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
        data,
        pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── GET /appointments/:id ─────────────────────────────────────────────────────
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

      return res.json({ status: 'success', data: appointment });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments ────────────────────────────────────────────────────────
appointmentRoutes.post(
  '/',
  validateRequest({ body: createAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { patientId, doctorId, scheduledAt, duration, type, chiefComplaint, notes } = req.body;

      const start = new Date(scheduledAt);

      if (await hasConflict(doctorId, start, duration ?? 30)) {
        return res.status(409).json({
          error: 'TimeSlotUnavailable',
          message: 'The doctor already has an appointment during this time slot',
        });
      }

      const appointment = await AppointmentModel.create({
        patientId,
        doctorId,
        clinicId,
        scheduledAt: start,
        duration: duration ?? 30,
        type,
        chiefComplaint,
        notes,
      });

      return res.status(201).json({ status: 'success', data: appointment });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── PUT /appointments/:id ─────────────────────────────────────────────────────
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

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        { scheduledAt: newStart, duration: newDuration, type, status, chiefComplaint, notes, encounterId },
        { new: true, runValidators: true },
      ).lean();

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── DELETE /appointments/:id (cancel) ─────────────────────────────────────────
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

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        {
          status: 'cancelled',
          cancelledBy: new Types.ObjectId(userId),
          cancelledAt: new Date(),
          cancellationReason,
        },
        { new: true },
      ).lean();

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);
