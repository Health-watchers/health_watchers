export type PrescriptionStatus =
  | 'draft'
  | 'pending_authorization'
  | 'authorized'
  | 'sent_to_pharmacy'
  | 'filled'
  | 'partially_filled'
  | 'expired'
  | 'cancelled'
  | 'denied';

export interface PrescriptionRecord {
  id: string;
  patientId: string;
  prescriberId: string;
  medicationCode: string;
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  quantity: number;
  refillsAllowed: number;
  refillsUsed: number;
  daysSupply: number;
  status: PrescriptionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  pharmacyId?: string;
  authorizationRequired: boolean;
  authorizationId?: string;
  isControlledSubstance: boolean;
  deaScheduleClass?: 'I' | 'II' | 'III' | 'IV' | 'V';
  fraudScore?: number;
}

export interface RefillRequest {
  id: string;
  prescriptionId: string;
  requestedAt: string;
  requestedBy: 'patient' | 'pharmacy' | 'provider';
  status: 'pending' | 'approved' | 'denied' | 'auto_approved';
  reason?: string;
}

export interface PharmacyTransmission {
  id: string;
  prescriptionId: string;
  pharmacyNcpdpId: string;
  transmittedAt: string;
  acknowledgedAt?: string;
  status: 'queued' | 'transmitted' | 'acknowledged' | 'rejected';
  rejectionReason?: string;
}

export interface PrescriptionAuditEntry {
  prescriptionId: string;
  action: string;
  actorId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
