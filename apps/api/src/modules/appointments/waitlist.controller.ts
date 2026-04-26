import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { WaitlistModel } from './waitlist.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';

const objectIdRegex = /^[a-f\d]{24}$/i;

const joinSchema = z.object({
  doctorId:        z.string().regex(objectIdRegex).optional(),
  requestedDate:   z.string().datetime({ offset: true }),
  appointmentType: z.enum(['consultation', 'follow-up', 'procedure', 'emergency']),
  priority:        z.enum(['routine', 'urgent']).default('routine'),
});

const router = Router();
router.use(authenticate);

// POST /waitlist — join
router.post(
  '/',
  validateRequest({ body: joinSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;

    // Prevent duplicate active entries
    const existing = await WaitlistModel.findOne({
      patientId: new Types.ObjectId(patientId),
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'Already on the waitlist' });
    }

    // Compute next position: urgent entries go before routine ones
    const { priority, doctorId, requestedDate, appointmentType } = req.body;

    // Count active entries that will be ahead of this new entry:
    // - If urgent: count urgent entries added before this one (routine entries go after all urgent)
    // - If routine: count ALL active entries (both urgent and routine added before)
    const aheadCount = await WaitlistModel.countDocuments({
      clinicId: new Types.ObjectId(clinicId),
      status:   { $in: ['waiting', 'notified'] },
      ...(priority === 'urgent'
        ? { priorityOrder: 1 } // only urgent entries ahead
        : {}),                 // routine: all active entries are ahead
    });

    const position = aheadCount + 1;

    const entry = await WaitlistModel.create({
      patientId:       new Types.ObjectId(patientId),
      clinicId:        new Types.ObjectId(clinicId),
      doctorId:        doctorId ? new Types.ObjectId(doctorId) : undefined,
      requestedDate:   new Date(requestedDate),
      appointmentType,
      priority,
      priorityOrder:   priority === 'urgent' ? 1 : 0,
      position,
    });

    return res.status(201).json({ status: 'success', data: entry });
  }),
);

// GET /waitlist — list (CLINIC_ADMIN only)
router.get(
  '/',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const status = (req.query.status as string) || 'waiting';

    const entries = await WaitlistModel.find({
      clinicId: new Types.ObjectId(clinicId),
      ...(status !== 'all' ? { status } : {}),
    })
      .sort({ priorityOrder: -1, addedAt: 1 }) // urgent first, then FIFO
      .lean();

    return res.json({ status: 'success', data: entries });
  }),
);

// GET /waitlist/position — patient's own position
router.get(
  '/position',
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;

    const entry = await WaitlistModel.findOne({
      patientId: new Types.ObjectId(patientId),
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
    }).lean();

    if (!entry) {
      return res.json({ status: 'success', data: null });
    }

    // Recompute live position:
    // Count entries that sort before this one:
    // - All urgent entries added before this one (if this is urgent)
    // - All urgent entries + all routine entries added before this one (if this is routine)
    const ahead = await WaitlistModel.countDocuments({
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
      _id:       { $ne: entry._id },
      $or: [
        // Higher priority (urgent) always goes first
        { priorityOrder: { $gt: entry.priorityOrder } },
        // Same priority, added earlier
        { priorityOrder: entry.priorityOrder, addedAt: { $lt: entry.addedAt } },
      ],
    });

    return res.json({ status: 'success', data: { ...entry, position: ahead + 1 } });
  }),
);

// DELETE /waitlist/:id — remove entry
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId, role } = req.user!;

    const filter: Record<string, unknown> = {
      _id:      new Types.ObjectId(req.params.id),
      clinicId: new Types.ObjectId(clinicId),
    };
    // Patients can only remove their own entry
    if (role === 'PATIENT') filter.patientId = new Types.ObjectId(patientId);

    const entry = await WaitlistModel.findOneAndDelete(filter);
    if (!entry) {
      return res.status(404).json({ error: 'NotFound', message: 'Waitlist entry not found' });
    }

    return res.json({ status: 'success', data: entry });
  }),
);

export const waitlistRoutes = router;
