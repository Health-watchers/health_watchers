import { Document } from 'mongoose';
import { AppRole } from '../../types/express';
import { stripRestrictedFields } from '../../utils/response.transformer';

export interface LabResultResponse {
  id: string;
  patientId: string;
  encounterId?: string;
  clinicId: string;
  orderedBy: string;
  testName: string;
  testCode?: string;
  status: string;
  results?: Record<string, any>;
  notes?: string;
  attachmentUrl?: string;
  isCritical?: boolean;
  criticalReason?: string;
  criticalAcknowledgedAt?: string;
  criticalAcknowledgedBy?: string;
  orderedAt: string;
  resultedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function toLabResultResponse(
  doc: Document & Record<string, any>,
  role?: AppRole
): LabResultResponse {
  const response: LabResultResponse = {
    id: String(doc._id),
    patientId: String(doc.patientId),
    encounterId: doc.encounterId ? String(doc.encounterId) : undefined,
    clinicId: String(doc.clinicId),
    orderedBy: String(doc.orderedBy),
    testName: doc.testName,
    testCode: doc.testCode,
    status: doc.status,
    results: doc.results,
    notes: doc.notes,
    attachmentUrl: doc.attachmentUrl,
    isCritical: doc.isCritical,
    criticalReason: doc.criticalReason,
    criticalAcknowledgedAt:
      doc.criticalAcknowledgedAt instanceof Date
        ? doc.criticalAcknowledgedAt.toISOString()
        : doc.criticalAcknowledgedAt,
    criticalAcknowledgedBy: doc.criticalAcknowledgedBy
      ? String(doc.criticalAcknowledgedBy)
      : undefined,
    orderedAt: doc.orderedAt instanceof Date ? doc.orderedAt.toISOString() : doc.orderedAt,
    resultedAt: doc.resultedAt instanceof Date ? doc.resultedAt.toISOString() : doc.resultedAt,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };

  if (role) return stripRestrictedFields(response, role) as LabResultResponse;
  return response;
}
