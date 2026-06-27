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
  videoStartSchema,
} from './appointments.validation';
import { SocketService } from '../../services/socket.service';
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

async function emitAppointmentStatusChange(
  appointmentId: string,
  status: string,
  appointment: any,
  additionalData?: any
) {
  try {
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

      // Also emit to clinic for staff notifications
      socketService.emitToClinic(appointment.clinicId.toString(), event, {
        appointmentId,
        appointment,
        ...additionalData,
      });
    }
  } catch (error) {
    // Log error but don't fail the request
    console.error('Failed to emit socket event:', error);
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

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        { 
          status: 'patient_arrived',
          checkedInAt: new Date(),
        },
        { new: true, runValidators: true }
      ).lean();

      // Emit real-time event
      await emitAppointmentStatusChange(
        req.params.id,
        'patient_arrived',
        updated!,
        { checkedInAt: updated?.checkedInAt }
      );

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
        data: updated,
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

      // Emit appointment created event
      await emitAppointmentStatusChange(appointment._id.toString(), 'scheduled', appointment);

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

      if (scheduledAt || duration) {
        const available = await isStaffAvailable(newDoctorId, clinicId, newStart, newDuration);
        if (!available) {
          return res.status(409).json({
            error: 'DoctorUnavailable',
            message: 'The doctor is not available at this time',
          });
        }
      }

      const updated = await AppointmentModel.findByIdAndUpdate(
        req.params.id,
        { scheduledAt: newStart, duration: newDuration, type, status, chiefComplaint, notes, encounterId },
        { new: true, runValidators: true },
      ).lean();

      // Emit real-time events for status changes
      if (status && status !== existing.status) {
        await emitAppointmentStatusChange(req.params.id, status, updated);
        
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

      // Emit rescheduled event if time changed
      if (scheduledAt && newStart.getTime() !== existing.scheduledAt.getTime()) {
        await emitAppointmentStatusChange(req.params.id, 'rescheduled', updated, {
          oldScheduledAt: existing.scheduledAt.toISOString(),
          newScheduledAt: newStart.toISOString(),
        });
      }

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

      // Emit real-time cancellation event
      await emitAppointmentStatusChange(req.params.id, 'cancelled', updated, {
        cancelledBy: userId,
        cancellationReason,
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

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);


// ── POST /appointments/:id/video-room (create video room) ──────────────────────
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

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

// ── POST /appointments/:id/video/end ──────────────────────────────────────────
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
