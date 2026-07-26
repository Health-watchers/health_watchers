import { Router, Request, Response } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { getStats } from './dashboard.controller';

const router = Router();

// GET /api/v1/dashboard/stats
router.get('/stats', authenticate, getStats);

// GET /api/v1/dashboard
// Returns KPI stats + upcoming appointments + patient population + payment overview
router.get('/', authenticate, async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next7Days = new Date(today);
  next7Days.setDate(next7Days.getDate() + 7);

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
    const { AppointmentModel } = await import('../appointments/appointment.model');

    const [
      totalPatients,
      newPatientsToday,
      todayEncounters,
      pendingPaymentsCount,
      confirmedPaymentsCount,
      failedPaymentsCount,
      activeDoctors,
      recentPatients,
      todayEncountersList,
      pendingPaymentsList,
      upcomingAppointments,
      appointmentsToday,
      highRiskCount,
    ] = await Promise.all([
      PatientModel.countDocuments({ clinicId }),
      PatientModel.countDocuments({ clinicId, createdAt: { $gte: today } }),
      EncounterModel.countDocuments({ clinicId, createdAt: { $gte: today } }),
      PaymentRecordModel.countDocuments({ clinicId, status: 'pending' }),
      PaymentRecordModel.countDocuments({
        clinicId,
        status: 'confirmed',
        updatedAt: { $gte: today },
      }),
      PaymentRecordModel.countDocuments({ clinicId, status: 'failed', updatedAt: { $gte: today } }),
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
      AppointmentModel.find({
        clinicId,
        scheduledAt: { $gte: new Date(), $lte: next7Days },
        status: { $in: ['scheduled', 'confirmed'] },
      })
        .sort({ scheduledAt: 1 })
        .limit(10)
        .populate('patientId', 'firstName lastName')
        .lean(),
      AppointmentModel.countDocuments({
        clinicId,
        scheduledAt: { $gte: today, $lt: tomorrow },
        status: { $in: ['scheduled', 'confirmed', 'patient_arrived'] },
      }),
      PatientModel.countDocuments({ clinicId, riskLevel: { $in: ['high', 'critical'] } }),
    ]);

    return res.json({
      status: 'success',
      data: {
        stats: {
          totalPatients,
          newPatientsToday,
          todayEncounters,
          pendingPayments: pendingPaymentsCount,
          activeDoctors,
          appointmentsToday,
        },
        patientPopulation: {
          total: totalPatients,
          newToday: newPatientsToday,
          highRisk: highRiskCount,
        },
        paymentStatus: {
          pending: pendingPaymentsCount,
          confirmedToday: confirmedPaymentsCount,
          failedToday: failedPaymentsCount,
        },
        upcomingAppointments,
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
