export interface Patient {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  address?: string;
  gender?: string;
  phone?: string;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
