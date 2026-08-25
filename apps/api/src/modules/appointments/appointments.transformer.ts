import { Document } from 'mongoose';
import { AppRole } from '../../types/express';
import { stripRestrictedFields } from '../../utils/response.transformer';

export interface AppointmentResponse {
  id: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  status: string;
  reason?: string;
  notes?: string;
  internalNotes?: string;
  videoCallUrl?: string;
  checkedInAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function toAppointmentResponse(
  doc: Document & Record<string, any>,
  role?: AppRole
): AppointmentResponse {
  const response: AppointmentResponse = {
    id: String(doc._id),
    patientId: String(doc.patientId),
    doctorId: String(doc.doctorId),
    clinicId: String(doc.clinicId),
    scheduledAt: doc.scheduledAt instanceof Date ? doc.scheduledAt.toISOString() : doc.scheduledAt,
    duration: doc.duration,
    type: doc.type,
    status: doc.status,
    reason: doc.reason,
    notes: doc.notes,
    internalNotes: doc.internalNotes,
    videoCallUrl: doc.videoCallUrl,
    checkedInAt: doc.checkedInAt instanceof Date ? doc.checkedInAt.toISOString() : doc.checkedInAt,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };

  if (role) return stripRestrictedFields(response, role) as AppointmentResponse;
  return response;
}
