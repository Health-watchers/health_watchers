import { Document } from 'mongoose';
import { Diagnosis, Prescription, VitalSigns } from './encounter.model';

export interface EncounterResponse {
  id: string;
  patientId: string;
  patient?: { firstName: string; lastName: string; systemId: string };
  clinicId: string;
  attendingDoctorId: string;
  chiefComplaint: string;
  status: string;
  notes?: string;
  treatmentPlan?: string;
  diagnosis?: Diagnosis[];
  vitalSigns?: VitalSigns;
  prescriptions?: Prescription[];
  followUpDate?: string;
  aiSummary?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toEncounterResponse(doc: Document & Record<string, any>): EncounterResponse {
  const patient = doc.patientId;
  const patientId = patient && typeof patient === 'object' && '_id' in patient
    ? String(patient._id)
    : String(patient);

  return {
    id: String(doc._id),
    patientId,
    patient: patient && typeof patient === 'object' && 'firstName' in patient
      ? { firstName: patient.firstName, lastName: patient.lastName, systemId: patient.systemId }
      : undefined,
    clinicId: String(doc.clinicId),
    attendingDoctorId: String(doc.attendingDoctorId),
    chiefComplaint: doc.chiefComplaint,
    status: doc.status,
    notes: doc.notes,
    treatmentPlan: doc.treatmentPlan,
    diagnosis: doc.diagnosis,
    vitalSigns: doc.vitalSigns,
    prescriptions: doc.prescriptions,
    followUpDate:
      doc.followUpDate instanceof Date ? doc.followUpDate.toISOString() : doc.followUpDate,
    aiSummary: doc.aiSummary,
    isActive: doc.isActive !== undefined ? doc.isActive : true,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}
