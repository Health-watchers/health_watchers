import { Request, Response } from 'express';
import { MedicationHistoryModel } from './medication-history.model';

/**
 * GET /api/v1/portal/medications
 * Returns all prescriptions for the authenticated patient.
 * Query params: active (bool), startDate, endDate, doctorId
 */
export async function getMyMedications(req: Request, res: Response) {
  const { patientId } = req.user as any;
  const { active, startDate, endDate, doctorId, limit = 100 } = req.query;

  const filter: any = { patientId };

  if (active !== undefined)  filter.active = active === 'true';
  if (doctorId)              filter.prescribingDoctorId = doctorId;
  if (startDate || endDate) {
    filter.startDate = {};
    if (startDate) filter.startDate.$gte = new Date(startDate as string);
    if (endDate)   filter.startDate.$lte = new Date(endDate as string);
  }

  const medications = await MedicationHistoryModel.find(filter)
    .sort({ startDate: -1 })
    .limit(Number(limit))
    .populate('prescribingDoctorId', 'name specialty');

  return res.json({ success: true, data: medications });
}

/**
 * GET /api/v1/portal/medications/:prescriptionId/refill-history
 */
export async function getRefillHistory(req: Request, res: Response) {
  const { patientId } = req.user as any;
  const { prescriptionId } = req.params;

  const medication = await MedicationHistoryModel.findOne({
    _id: prescriptionId,
    patientId, // ensures patient can only access own records
  });

  if (!medication) {
    return res.status(404).json({ success: false, message: 'Prescription not found' });
  }

  return res.json({
    success: true,
    data: {
      medicationName: medication.medicationName,
      refillHistory: medication.refillHistory,
      totalRefills: medication.refillHistory.length,
    },
  });
}
