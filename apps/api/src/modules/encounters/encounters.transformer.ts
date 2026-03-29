import { Document } from 'mongoose';
import { Diagnosis, Prescription, VitalSigns } from './encounter.model';

export interface EncounterResponse {
  id: string;
  patientId: string;
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
  createdAt: string;
  updatedAt: string;
}

export function toEncounterResponse(doc: Document & Record<string, any>): EncounterResponse {
  return {
    id:                String(doc._id),
    patientId:         String(doc.patientId),
    clinicId:          String(doc.clinicId),
    attendingDoctorId: String(doc.attendingDoctorId),
    chiefComplaint:    doc.chiefComplaint,
    status:            doc.status,
    notes:             doc.notes,
    treatmentPlan:     doc.treatmentPlan,
    diagnosis:         doc.diagnosis,
    vitalSigns:        doc.vitalSigns,
    prescriptions:     doc.prescriptions,
    followUpDate:      doc.followUpDate instanceof Date ? doc.followUpDate.toISOString() : doc.followUpDate,
    aiSummary:         doc.aiSummary,
    createdAt:         doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt:         doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}
