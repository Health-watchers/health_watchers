import { Router, Request, Response } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { getStats } from './dashboard.controller';

const router = Router();

// GET /api/v1/dashboard/stats
router.get('/stats', authenticate, getStats);

// GET /api/v1/dashboard
// Returns today's stats + recent records + appointments summary + payment breakdown + patient metrics
router.get('/', authenticate, async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

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
      todayPatients,
      todayEncounters,
      pendingPayments,
      activeDoctors,
      recentPatients,
      todayEncountersList,
      pendingPaymentsList,
      // Appointments summary
      todayAppointments,
      upcomingAppointmentsList,
      appointmentStatusCounts,
      // Payment breakdown
      paymentStatusCounts,
      recentConfirmedPayments,
      // Patient population metrics
      totalPatients,
      activePatients,
      riskLevelCounts,
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
      // Appointments
      AppointmentModel.countDocuments({ clinicId, scheduledAt: { $gte: today, $lt: tomorrow } }),
      AppointmentModel.find({
        clinicId,
        scheduledAt: { $gte: new Date(), $lte: nextWeek },
        status: { $in: ['scheduled', 'confirmed'] },
      })
        .sort({ scheduledAt: 1 })
        .limit(5)
        .populate('patientId', 'firstName lastName')
        .lean(),
      AppointmentModel.aggregate([
        { $match: { clinicId: String(clinicId), scheduledAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Payment breakdown
      PaymentRecordModel.aggregate([
        { $match: { clinicId: String(clinicId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PaymentRecordModel.find({ clinicId, status: 'confirmed' })
        .sort({ confirmedAt: -1 })
        .limit(5)
        .lean(),
      // Patient population
      PatientModel.countDocuments({ clinicId }),
      PatientModel.countDocuments({ clinicId, isActive: true }),
      PatientModel.aggregate([
        { $match: { clinicId: String(clinicId), riskLevel: { $exists: true } } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
    ]);

    // Normalise aggregation results to keyed objects
    const appointmentsByStatus = Object.fromEntries(
      appointmentStatusCounts.map((r: { _id: string; count: number }) => [r._id, r.count])
    );
    const paymentsByStatus = Object.fromEntries(
      paymentStatusCounts.map((r: { _id: string; count: number }) => [r._id, r.count])
    );
    const patientsByRisk = Object.fromEntries(
      riskLevelCounts.map((r: { _id: string; count: number }) => [r._id, r.count])
    );

    return res.json({
      status: 'success',
      data: {
        stats: { todayPatients, todayEncounters, pendingPayments, activeDoctors },
        recentPatients,
        todayEncounters: todayEncountersList,
        pendingPayments: pendingPaymentsList,
        appointments: {
          todayTotal: todayAppointments,
          scheduled: appointmentsByStatus['scheduled'] ?? 0,
          confirmed: appointmentsByStatus['confirmed'] ?? 0,
          cancelled: appointmentsByStatus['cancelled'] ?? 0,
          completed: appointmentsByStatus['completed'] ?? 0,
          upcoming: upcomingAppointmentsList,
        },
        paymentStatus: {
          pending: paymentsByStatus['pending'] ?? 0,
          confirmed: paymentsByStatus['confirmed'] ?? 0,
          failed: paymentsByStatus['failed'] ?? 0,
          recentConfirmed: recentConfirmedPayments,
        },
        patientMetrics: {
          total: totalPatients,
          active: activePatients,
          inactive: totalPatients - activePatients,
          byRisk: {
            low: patientsByRisk['low'] ?? 0,
            medium: patientsByRisk['medium'] ?? 0,
            high: patientsByRisk['high'] ?? 0,
            critical: patientsByRisk['critical'] ?? 0,
          },
        },
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
