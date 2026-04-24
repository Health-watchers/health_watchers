import { Request, Response } from 'express';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { UserModel } from '../auth/models/user.model';

/**
 * GET /api/v1/dashboard/stats
 * Returns KPI statistics + recent records scoped to the authenticated user's clinic.
 */
export async function getStats(req: Request, res: Response) {
  try {
    const clinicId = req.user?.clinicId;

    if (!clinicId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Clinic ID not found in user context',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
