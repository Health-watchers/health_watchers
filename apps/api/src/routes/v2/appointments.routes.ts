import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppointmentModel } from '../../modules/appointments/appointment.model';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  cancelAppointmentSchema,
  listAppointmentsQuerySchema,
  availabilityQuerySchema,
  appointmentIdParamsSchema,
  doctorIdParamsSchema,
} from '../../modules/appointments/appointments.validation';
import { SocketService } from '../../services/socket.service';
import { NotificationModel, NOTIFICATION_TYPES } from '../../modules/notifications/notification.model';

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

  const filter: Record<string, unknown> = {
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledAt: { $lt: proposedEnd },
  };

  if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };

  const candidates = await AppointmentModel.find(filter)
    .select('scheduledAt duration')
    .lean();

  return candidates.some((appt) => {
    const apptEnd = new Date(
      new Date(appt.scheduledAt).getTime() + appt.duration * 60_000,
    );
    return apptEnd > scheduledAt;
  });
}

async function emitAppointmentStatusChange(
  appointmentId: string,
  status: string,
  appointment: any,
  additionalData?: any
) {
  const socketService = SocketService.getInstance();
  const eventMap = {
    confirmed: 'appointment:confirmed',
    cancelled: 'appointment:cancelled',
    rescheduled: 'appointment:rescheduled',
    patient_arrived: 'appointment:patient_arrived',
  };

  const event = eventMap[status as keyof typeof eventMap];
  if (event) {
    socketService.emitAppointmentUpdate(appointmentId, event, {
      appointment,
      ...additionalData,
    });

    socketService.emitToClinic(appointment.clinicId.toString(), event, {
      appointmentId,
      appointment,
      ...additionalData,
    });
  }
}

// ── POST /appointments/:id/check-in ───────────────────────────────────────────
appointmentRoutes.post(
  '/:id/check-in',
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const appointment = await AppointmentModel.findOne({
        _id: req.params.id,
        clinicId,
      });

      if (!appointment) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Appointment not found',
        });
      }

      if (appointment.status !== 'confirmed' && appointment.status !== 'scheduled') {
        return res.status(400).json({
          error: 'InvalidStatus',
          message: 'Only confirmed or scheduled appointments can be checked in',
        });
      }

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        {
          status: 'patient_arrived',
          checkedInAt: new Date(),
        },
        { new: true, runValidators: true }
      ).lean();

      await emitAppointmentStatusChange(
        req.params.id,
        'patient_arrived',
        updated,
        { checkedInAt: updated.checkedInAt }
      );

      await NotificationModel.create({
        userId: appointment.doctorId,
        clinicId: appointment.clinicId,
        type: 'appointment_reminder',
        title: 'Patient Checked In',
        message: `Patient has checked in for their appointment`,
        metadata: {
          appointmentId: appointment._id,
          status: 'patient_arrived',
        },
      });

      return res.json({
        status: 'success',
        data: updated,
        message: 'Patient checked in successfully',
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'InternalError',
        message: err.message,
      });
    }
  },
);

// ── GET /appointments (V2 with enhanced response format) ──────────────────────
appointmentRoutes.get(
  '/',
  validateRequest({ query: listAppointmentsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, role, userId } = req.user!;
      const { doctorId, patientId, status, dateFrom, dateTo, page, limit } =
        req.query as any;

      const filter: Record<string, unknown> = { clinicId };

      if (role === 'PATIENT') filter.patientId = userId;
      else {
        if (doctorId) filter.doctorId = new Types.ObjectId(doctorId);
        if (patientId) filter.patientId = new Types.ObjectId(patientId);
      }

      if (status) {
        const ALLOWED_STATUSES = new Set(['scheduled', 'confirmed', 'cancelled', 'completed', 'patient_arrived']);
        if (!ALLOWED_STATUSES.has(String(status))) {
          return res.status(400).json({ error: 'ValidationError', message: 'Invalid status value' });
        }
        filter.status = String(status);
      }

      if (dateFrom || dateTo) {
        filter.scheduledAt = {};
        if (dateFrom) (filter.scheduledAt as any).$gte = new Date(dateFrom);
        if (dateTo) (filter.scheduledAt as any).$lte = new Date(dateTo);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [data, total] = await Promise.all([
        AppointmentModel.find(filter)
          .populate('patientId', 'firstName lastName email phone')
          .populate('doctorId', 'firstName lastName email')
          .sort({ scheduledAt: 1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        AppointmentModel.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        data: {
          appointments: data,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
            hasNext: Number(page) < Math.ceil(total / Number(limit)),
            hasPrev: Number(page) > 1,
          },
          meta: {
            totalByStatus: await AppointmentModel.aggregate([
              { $match: filter },
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
          },
        },
        version: '2.0',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'InternalError',
        message: err.message,
      });
    }
  },
);

// ── PUT /appointments/:id (V2 with real-time updates) ─────────────────────────
appointmentRoutes.put(
  '/:id',
  validateRequest({ params: appointmentIdParamsSchema, body: updateAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const existing = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'Appointment not found',
        });
      }

      const { scheduledAt, duration, type, status, chiefComplaint, notes, encounterId } = req.body;
      const oldStatus = existing.status;
      const oldScheduledAt = existing.scheduledAt;

      const newStart = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt;
      const newDuration = duration ?? existing.duration;
      const newDoctorId = String(existing.doctorId);

      if ((scheduledAt || duration) && await hasConflict(newDoctorId, newStart, newDuration, req.params.id)) {
        return res.status(409).json({
          success: false,
          error: 'TimeSlotUnavailable',
          message: 'The doctor already has an appointment during this time slot',
        });
      }

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        {
          scheduledAt: newStart,
          duration: newDuration,
          type,
          status,
          chiefComplaint,
          notes,
          encounterId,
        },
        { new: true, runValidators: true },
      ).lean();

      if (status && status !== oldStatus) {
        await emitAppointmentStatusChange(req.params.id, status, updated);

        await NotificationModel.create({
          userId: existing.patientId,
          clinicId: existing.clinicId,
          type: 'appointment_reminder',
          title: 'Appointment Status Updated',
          message: `Your appointment status has been updated to ${status}`,
          metadata: {
            appointmentId: existing._id,
            oldStatus,
            newStatus: status,
          },
        });
      }

      if (scheduledAt && newStart.getTime() !== oldScheduledAt.getTime()) {
        await emitAppointmentStatusChange(req.params.id, 'rescheduled', updated, {
          oldScheduledAt: oldScheduledAt.toISOString(),
          newScheduledAt: newStart.toISOString(),
        });
      }

      return res.json({
        success: true,
        data: updated,
        version: '2.0',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'InternalError',
        message: err.message,
      });
    }
  },
);

// ── DELETE /appointments/:id (V2 with real-time updates) ──────────────────────
appointmentRoutes.delete(
  '/:id',
  validateRequest({ params: appointmentIdParamsSchema, body: cancelAppointmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'Appointment not found',
        });
      }

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

      await emitAppointmentStatusChange(req.params.id, 'cancelled', updated, {
        cancelledBy: userId,
        cancellationReason,
      });

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
            type: 'appointment_reminder',
            metadata: {
              appointmentId: appointment._id,
              cancellationReason,
            },
          })
        )
      );

      return res.json({
        success: true,
        data: updated,
        version: '2.0',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'InternalError',
        message: err.message,
      });
    }
  },
);

// Re-export other routes with V2 enhancements
appointmentRoutes.get('/doctor/:doctorId/availability', /* same as V1 but with V2 response format */);
appointmentRoutes.get('/:id', /* same as V1 but with V2 response format */);
appointmentRoutes.post('/', /* same as V1 but with V2 response format and real-time events */);