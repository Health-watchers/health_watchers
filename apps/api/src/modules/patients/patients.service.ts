import { Types } from 'mongoose';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { UserModel } from '../auth/models/user.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { toPatientResponse } from './patients.transformer';
import { toPaymentResponse } from '../payments/payments.transformer';
import { toEncounterResponse } from '../encounters/encounters.transformer';
import { patientsCreatedTotal } from '../../services/metrics.service';
import { auditLog } from '../audit/audit.service';
import { cache } from '@api/services/cache.service';
import { emitToClinic } from '@api/realtime/socket';
import { incrementUsage } from '../subscriptions/usage.service';

/**
 * Generate next sequential patient system ID
 * @param clinicId - The clinic ID
 * @returns Generated system ID
 */
async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: clinicId },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const short = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `${short}-${padded}`;
}

/**
 * Calculate health trend from readings
 * @param values - Array of numeric values
 * @returns Trend direction
 */
function calcTrend(values: number[]): 'improving' | 'stable' | 'worsening' {
  if (values.length < 2) return 'stable';
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const threshold = first * 0.03; // 3% change threshold
  if (Math.abs(delta) < threshold) return 'stable';
  return delta < 0 ? 'improving' : 'worsening';
}

/**
 * Get paginated list of patients for a clinic
 * @param clinicId - The clinic ID
 * @param query - Query parameters (page, pageSize, status, etc.)
 * @returns Paginated patient list
 */
export async function getPatientsList(clinicId: string, query: any) {
  const { page = 1, pageSize = 20, status } = query;

  const filter: any = { clinicId };
  if (status) filter.status = status;

  const skip = (page - 1) * pageSize;
  const patients = await PatientModel.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);

  const total = await PatientModel.countDocuments(filter);

  return {
    items: patients.map(toPatientResponse),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Search patients by name or system ID
 * @param clinicId - The clinic ID
 * @param searchTerm - Search term
 * @returns Matching patients
 */
export async function searchPatients(clinicId: string, searchTerm: string) {
  const regex = new RegExp(searchTerm, 'i');
  const patients = await PatientModel.find({
    clinicId,
    $or: [
      { firstName: regex },
      { lastName: regex },
      { systemId: regex },
      { contactNumber: regex },
    ],
  }).limit(20);

  return patients.map(toPatientResponse);
}

/**
 * Get patient by ID
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @returns Patient record
 */
export async function getPatientById(clinicId: string, patientId: string) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }
  return toPatientResponse(patient);
}

/**
 * Create a new patient
 * @param clinicId - The clinic ID
 * @param userId - The user ID creating the patient
 * @param data - Patient data
 * @returns Created patient record
 */
export async function createPatient(clinicId: string, userId: string, data: any) {
  const {
    firstName,
    lastName,
    dateOfBirth,
    sex,
    contactNumber,
    email,
    address,
    emergencyContacts,
    allergies,
    insurance,
    metadata,
  } = data;

  // Check for duplicates
  const duplicateService = new DuplicateDetectionService();
  const duplicates = await duplicateService.findDuplicates(
    clinicId,
    firstName,
    lastName,
    dateOfBirth
  );

  if (duplicates.length > 0) {
    throw new Error('PotentialDuplicate');
  }

  const systemId = await nextSystemId(clinicId);

  const patient = await PatientModel.create({
    clinicId,
    systemId,
    firstName,
    lastName,
    dateOfBirth,
    sex,
    contactNumber,
    email,
    address,
    emergencyContacts: emergencyContacts || [],
    allergies: allergies || [],
    insurance: insurance || [],
    status: 'active',
    metadata: metadata || {},
    registeredBy: userId,
  });

  // Increment usage for subscription
  await incrementUsage(clinicId, 'patients');

  // Record metrics
  patientsCreatedTotal.inc({ clinic_id: clinicId });

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.created',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
    details: { systemId },
  });

  // Invalidate cache
  await cache.del(`patients:${clinicId}`);

  // Emit realtime event
  emitToClinic(clinicId, 'patient:created', { patientId: patient._id.toString() });

  return toPatientResponse(patient);
}

/**
 * Update patient information
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @param userId - The user ID making the update
 * @param data - Updated patient data
 * @returns Updated patient record
 */
export async function updatePatient(
  clinicId: string,
  patientId: string,
  userId: string,
  data: any
) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }

  Object.assign(patient, data);
  await patient.save();

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.updated',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
    details: { fields: Object.keys(data) },
  });

  // Invalidate cache
  await cache.del(`patients:${clinicId}`);
  await cache.del(`patient:${patientId}`);

  // Emit realtime event
  emitToClinic(clinicId, 'patient:updated', { patientId: patient._id.toString() });

  return toPatientResponse(patient);
}

/**
 * Delete (archive) a patient
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @param userId - The user ID deleting the patient
 */
export async function deletePatient(clinicId: string, patientId: string, userId: string) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }

  patient.status = 'archived';
  await patient.save();

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.deleted',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
  });

  // Invalidate cache
  await cache.del(`patients:${clinicId}`);
  await cache.del(`patient:${patientId}`);

  // Emit realtime event
  emitToClinic(clinicId, 'patient:deleted', { patientId: patient._id.toString() });
}

/**
 * Get patient's payment history
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @returns Payment records
 */
export async function getPatientPayments(clinicId: string, patientId: string) {
  const payments = await PaymentRecordModel.find({ clinicId, patientId }).sort({ createdAt: -1 });
  return payments.map(toPaymentResponse);
}

/**
 * Get patient's encounter history
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @returns Encounter records
 */
export async function getPatientEncounters(clinicId: string, patientId: string) {
  const encounters = await EncounterModel.find({ clinicId, patientId }).sort({ encounterDate: -1 });
  return encounters.map(toEncounterResponse);
}

/**
 * Get patient's lab results
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @returns Lab result records
 */
export async function getPatientLabResults(clinicId: string, patientId: string) {
  const results = await LabResultModel.find({ clinicId, patientId }).sort({ collectedAt: -1 });
  return results;
}

/**
 * Add allergy to patient record
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @param userId - The user ID adding the allergy
 * @param allergyData - Allergy information
 * @returns Updated patient record
 */
export async function addPatientAllergy(
  clinicId: string,
  patientId: string,
  userId: string,
  allergyData: any
) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }

  patient.allergies.push(allergyData);
  await patient.save();

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.allergy.added',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
    details: { allergen: allergyData.allergen },
  });

  await cache.del(`patient:${patientId}`);

  return toPatientResponse(patient);
}

/**
 * Update patient allergy
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @param allergyId - The allergy ID
 * @param userId - The user ID making the update
 * @param allergyData - Updated allergy data
 * @returns Updated patient record
 */
export async function updatePatientAllergy(
  clinicId: string,
  patientId: string,
  allergyId: string,
  userId: string,
  allergyData: any
) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }

  const allergy = patient.allergies.id(allergyId);
  if (!allergy) {
    throw new Error('Allergy not found');
  }

  Object.assign(allergy, allergyData);
  await patient.save();

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.allergy.updated',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
    details: { allergyId },
  });

  await cache.del(`patient:${patientId}`);

  return toPatientResponse(patient);
}

/**
 * Remove patient allergy
 * @param clinicId - The clinic ID
 * @param patientId - The patient ID
 * @param allergyId - The allergy ID
 * @param userId - The user ID removing the allergy
 * @returns Updated patient record
 */
export async function deletePatientAllergy(
  clinicId: string,
  patientId: string,
  allergyId: string,
  userId: string
) {
  const patient = await PatientModel.findOne({ _id: patientId, clinicId });
  if (!patient) {
    throw new Error('Patient not found');
  }

  patient.allergies.pull(allergyId);
  await patient.save();

  // Audit log
  await auditLog({
    userId,
    clinicId,
    action: 'patient.allergy.deleted',
    resourceType: 'Patient',
    resourceId: patient._id.toString(),
    details: { allergyId },
  });

  await cache.del(`patient:${patientId}`);

  return toPatientResponse(patient);
}
