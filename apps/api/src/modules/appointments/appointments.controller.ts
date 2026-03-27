import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
import { authenticate } from '../../middlewares/auth.middleware';

export const appointmentRoutes = Router();

appointmentRoutes.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the doctor already has an appointment that overlaps the
 * proposed [start, end) window (excluding a specific appointment id when
 * rescheduling).
 */
async function hasConflict(
  doctorId: string,
  scheduledAt: Date,
  durationMinutes: number,
  excludeId?: string
): Promise<boolean> {
  const proposedEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

  const query: Record<string, unknown> = {
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ['scheduled'] },
    // existing appointment starts before proposed end AND ends after proposed start
    scheduledAt: { $lt: proposedEnd },
    $expr: {
      $gt: [
        { $add: ['$scheduledAt', { $multiply: ['$durationMinutes', 60_000] }] },
        scheduledAt.getTime(),
      ],
    },
  };

  if (excludeId) {
    query._id = { $ne: new Types.ObjectId(excludeId) };
  }

  return (await AppointmentModel.countDocuments(query)) > 0;
}

// ── GET /appointments/availability ───────────────────────────────────────────
// Must be registered before /:id to avoid route shadowing
appointmentRoutes.get('/availability', async (req: Request, res: Response) => {
  try {
    const { doctorId, date } = req.query as { doctorId?: string; date?: string };
    const { clinicId } = req.user!;

    if (!doctorId || !date) {
      return res.status(400).json({ error: 'BadRequest', message: 'doctorId and date are required' });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const booked = await AppointmentModel.find({
      clinicId,
      doctorId: new Types.ObjectId(doctorId),
      status: 'scheduled',
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select('scheduledAt durationMinutes')
      .sort({ scheduledAt: 1 })
      .lean();

    return res.json({ status: 'success', data: booked });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── GET /appointments ─────────────────────────────────────────────────────────
appointmentRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const appointments = await AppointmentModel.find({ clinicId })
      .sort({ scheduledAt: 1 })
      .lean();
    return res.json({ status: 'success', data: appointments });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── GET /appointments/:id ─────────────────────────────────────────────────────
appointmentRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!appointment) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });
    return res.json({ status: 'success', data: appointment });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── POST /appointments ────────────────────────────────────────────────────────
appointmentRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const { patientId, doctorId, scheduledAt, durationMinutes = 30, reason, notes } = req.body;

    if (!patientId || !doctorId || !scheduledAt) {
      return res.status(400).json({ error: 'BadRequest', message: 'patientId, doctorId, and scheduledAt are required' });
    }

    const start = new Date(scheduledAt);

    if (await hasConflict(doctorId, start, durationMinutes)) {
      return res.status(409).json({
        error: 'TimeSlotUnavailable',
        message: 'The doctor already has an appointment during this time slot',
      });
    }

    const appointment = await AppointmentModel.create({
      patientId, doctorId, clinicId, scheduledAt: start,
      durationMinutes, reason, notes,
    });

    return res.status(201).json({ status: 'success', data: appointment });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── PATCH /appointments/:id ───────────────────────────────────────────────────
appointmentRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const existing = await AppointmentModel.findOne({ _id: req.params.id, clinicId });
    if (!existing) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });

    const { scheduledAt, durationMinutes, doctorId, status, reason, notes } = req.body;

    // Re-check conflicts only when time/doctor is changing
    const newStart     = scheduledAt     ? new Date(scheduledAt)  : existing.scheduledAt;
    const newDuration  = durationMinutes ?? existing.durationMinutes;
    const newDoctorId  = doctorId        ?? String(existing.doctorId);

    const timeChanged   = scheduledAt || durationMinutes || doctorId;
    if (timeChanged && await hasConflict(newDoctorId, newStart, newDuration, req.params.id)) {
      return res.status(409).json({
        error: 'TimeSlotUnavailable',
        message: 'The doctor already has an appointment during this time slot',
      });
    }

    const updated = await AppointmentModel.findByIdAndUpdate(
      req.params.id,
      { scheduledAt: newStart, durationMinutes: newDuration, doctorId: newDoctorId, status, reason, notes },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ status: 'success', data: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── DELETE /appointments/:id ──────────────────────────────────────────────────
appointmentRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const appointment = await AppointmentModel.findOneAndDelete({ _id: req.params.id, clinicId });
    if (!appointment) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });
    return res.json({ status: 'success', data: null });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
