export interface Patient {
  id: string;
  fullName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other";
  phone: string;
  createdAt: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  notes: string;
  diagnosis: string;
  createdAt: string;
}

export interface PaymentIntent {
  patientId: string;
  amount: number;
  asset: string;
  memo?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';
export type DisputeStatus = 'open' | 'under_review' | 'resolved_refund' | 'resolved_no_action' | 'closed';

export interface PaymentDispute {
  id: string;
  paymentIntentId: string;
  clinicId: string;
  patientId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  refundIntentId?: string;
}

export interface OpenDisputeRequest {
  patientId: string;
  reason: DisputeReason;
  description: string;
}

export interface ResolveDisputeRequest {
  status: 'resolved_refund' | 'resolved_no_action' | 'closed';
  resolutionNotes?: string;
}

export interface IssueRefundRequest {
  amount: string;
  destinationPublicKey: string;
}
