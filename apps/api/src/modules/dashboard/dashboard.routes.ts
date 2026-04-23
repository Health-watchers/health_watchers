import { Router, Request, Response } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { getStats } from './dashboard.controller';

const router = Router();

// GET /api/v1/dashboard/stats
// Returns KPI statistics scoped to the authenticated user's clinic
router.get('/stats', authenticate, getStats);

// GET /api/v1/dashboard
// Returns today's stats + recent records (last 5 each), scoped to the authenticated clinic
router.get('/', authenticate, async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    return res
      .status(400)
      .json({ error: 'Bad Request', message: 'Clinic ID not found in user context' });
  }

  try {
    const { PatientModel } = await import('../patients/models/patient.model');
    const { EncounterModel } = await import('../encounters/encounter.model');
    const { PaymentRecordModel } = await import('../payments/models/payment-record.model');
    const { UserModel } = await import('../auth/models/user.model');

    const [
      todayPatients,
      todayEncounters,
      pendingPayments,
      activeDoctors,
      recentPatients,
      todayEncountersList,
      pendingPaymentsList,
    ] = await Promise.all([
      PatientModel.countDocuments({ clinicId, createdAt: { $gte: today } }),
      EncounterModel.countDocuments({ clinicId, createdAt: { $gte: today } }),
      PaymentRecordModel.countDocuments({ clinicId, status: 'pending' }),
      UserModel.countDocuments({ clinicId, role: 'DOCTOR', isActive: true }),
      PatientModel.find({ clinicId }).sort({ createdAt: -1 }).limit(5).lean(),
      EncounterModel.find({ clinicId, createdAt: { $gte: today } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      PaymentRecordModel.find({ clinicId, status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return res.json({
      status: 'success',
      data: {
        stats: { todayPatients, todayEncounters, pendingPayments, activeDoctors },
        recentPatients,
        todayEncounters: todayEncountersList,
        pendingPayments: pendingPaymentsList,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
