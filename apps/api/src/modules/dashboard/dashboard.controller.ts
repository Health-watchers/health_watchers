import { Request, Response } from 'express';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';

/**
 * GET /api/v1/dashboard/stats
 * Returns dashboard statistics scoped to the authenticated user's clinic
 */
export async function getStats(req: Request, res: Response) {
  try {
    const clinicId = req.user?.clinicId;
    
    if (!clinicId) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Clinic ID not found in user context' 
      });
    }

    // Get start of today for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Execute all queries in parallel for optimal performance
    const [todayPatients, openEncounters, pendingPayments, totalPatients] = await Promise.all([
      PatientModel.countDocuments({ 
        clinicId, 
        createdAt: { $gte: today } 
      }),
      EncounterModel.countDocuments({ 
        clinicId, 
        status: 'open' 
      }),
      PaymentRecordModel.countDocuments({ 
        clinicId, 
        status: 'pending' 
      }),
      PatientModel.countDocuments({ 
        clinicId, 
        isActive: true 
      }),
    ]);

    return res.json({
      status: 'success',
      data: {
        todayPatients,
        openEncounters,
        pendingPayments,
        totalPatients,
      },
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
