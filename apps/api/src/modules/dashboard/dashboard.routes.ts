import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/v1/dashboard
// Returns today's stats + recent records (last 5 each)
router.get('/', async (_req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Lazy-import models to avoid circular deps at startup
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
      PatientModel.countDocuments({ createdAt: { $gte: today } }),
      EncounterModel.countDocuments({ createdAt: { $gte: today } }),
      PaymentRecordModel.countDocuments({ status: 'pending' }),
      UserModel.countDocuments({ role: 'DOCTOR', isActive: true }),
      PatientModel.find().sort({ createdAt: -1 }).limit(5).lean(),
      EncounterModel.find({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).limit(5).lean(),
      PaymentRecordModel.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean(),
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
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
