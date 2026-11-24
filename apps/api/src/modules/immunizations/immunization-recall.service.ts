/**
 * Immunization recalls handling (Issue #1246)
 *
 * Initiates and manages recalls for vaccine lots, identifies affected
 * patients who received doses from a recalled lot, and tracks resolution.
 */
import { ImmunizationRecallModel } from './immunization-recall.model';
import { ImmunizationModel } from './immunization.model';
import { VaccineLotModel } from './vaccine-lot.model';
import { recallLot } from './vaccine-lot.service';
import { PatientModel } from '../patients/models/patient.model';

export interface CreateRecallInput {
  clinicId: string;
  lotId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  initiatedBy: string;
  patientsNotified?: boolean;
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** Distinct patients who received doses from the given lot. */
export async function findAffectedPatients(clinicId: string, lotNumber: string) {
  return ImmunizationModel.find({ clinicId, lotNumber, isActive: true })
    .distinct('patientId')
    .then((ids) => ids.map(String));
}

/**
 * Initiate a recall for a lot: marks the lot recalled, counts affected
 * patients, and records the recall.
 */
export async function createRecall(input: CreateRecallInput) {
  const lot = await VaccineLotModel.findOne({
    _id: input.lotId,
    clinicId: input.clinicId,
  });
  if (!lot) throw httpError(404, 'Lot not found');
  if (lot.status === 'recalled') {
    throw httpError(409, `Lot ${lot.lotNumber} is already recalled`);
  }

  const affectedPatientIds = await findAffectedPatients(input.clinicId, lot.lotNumber);
  const affectedPatientCount = affectedPatientIds.length;

  await recallLot(String(lot._id), input.clinicId, input.reason);

  const now = new Date();
  return ImmunizationRecallModel.create({
    clinicId: input.clinicId,
    lotNumber: lot.lotNumber,
    vaccineCode: lot.vaccineCode,
    vaccineName: lot.vaccineName,
    manufacturer: lot.manufacturer,
    reason: input.reason,
    severity: input.severity,
    initiatedBy: input.initiatedBy,
    recalledAt: now,
    affectedPatientCount,
    patientsNotified: input.patientsNotified ?? false,
    notifiedAt: input.patientsNotified ? now : undefined,
  });
}

/** List recalls for a clinic. */
export async function listRecalls(
  clinicId: string,
  options: { status?: string; lotNumber?: string; limit?: number } = {}
) {
  const filter: Record<string, unknown> = { clinicId };
  if (options.status) filter.status = options.status;
  if (options.lotNumber) filter.lotNumber = options.lotNumber;

  return ImmunizationRecallModel.find(filter)
    .sort({ recalledAt: -1 })
    .limit(options.limit ?? 50)
    .lean();
}

/** Affected patients for a recall, with patient demographics. */
export async function getAffectedPatients(recallId: string, clinicId: string) {
  const recall = await ImmunizationRecallModel.findOne({ _id: recallId, clinicId }).lean();
  if (!recall) throw httpError(404, 'Recall not found');

  const patientIds = await findAffectedPatients(clinicId, recall.lotNumber);

  const patients = await PatientModel.find({ _id: { $in: patientIds }, clinicId })
    .select('firstName lastName systemId dateOfBirth contactNumber')
    .lean();

  return {
    recall,
    patients: patients.map((p) => ({
      patientId: String(p._id),
      firstName: p.firstName,
      lastName: p.lastName,
      systemId: p.systemId,
      dateOfBirth: p.dateOfBirth,
      contactNumber: p.contactNumber,
    })),
  };
}

/** Mark a recall as resolved. */
export async function resolveRecall(recallId: string, clinicId: string, resolvedBy: string) {
  const recall = await ImmunizationRecallModel.findOneAndUpdate(
    { _id: recallId, clinicId },
    { status: 'resolved', resolvedAt: new Date(), resolvedBy },
    { new: true }
  );
  if (!recall) throw httpError(404, 'Recall not found');
  return recall;
}

/** Record that patients were notified about a recall. */
export async function markPatientsNotified(recallId: string, clinicId: string) {
  const recall = await ImmunizationRecallModel.findOneAndUpdate(
    { _id: recallId, clinicId },
    { patientsNotified: true, notifiedAt: new Date() },
    { new: true }
  );
  if (!recall) throw httpError(404, 'Recall not found');
  return recall;
}
