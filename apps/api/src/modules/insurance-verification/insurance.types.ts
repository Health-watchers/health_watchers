export interface InsurancePolicy {
  patientId: string;
  payerId: string;
  payerName: string;
  memberId: string;
  groupNumber?: string;
  planType: 'HMO' | 'PPO' | 'EPO' | 'POS' | 'Medicare' | 'Medicaid';
}

export interface EligibilityResult {
  id: string;
  patientId: string;
  payerId: string;
  checkedAt: string;
  active: boolean;
  effectiveDate?: string;
  terminationDate?: string;
  copay?: number;
  coinsurance?: number;
  deductible?: number;
  deductibleMet?: number;
  outOfPocketMax?: number;
  outOfPocketMet?: number;
  latencyMs: number;
  confidence: number;
}

export interface BenefitDetail {
  serviceType: string;
  covered: boolean;
  requiresAuthorization: boolean;
  copay?: number;
  notes?: string;
}

export interface PriorAuthorization {
  id: string;
  patientId: string;
  serviceType: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: string;
  decidedAt?: string;
  expiresAt?: string;
  denialReason?: string;
}

export interface InsuranceClaim {
  id: string;
  patientId: string;
  payerId: string;
  serviceType: string;
  billedAmount: number;
  submittedAt: string;
  status: 'submitted' | 'accepted' | 'rejected' | 'paid' | 'denied' | 'appealed';
  denialCode?: string;
  denialReason?: string;
  paidAmount?: number;
}

export interface ClaimAppeal {
  id: string;
  claimId: string;
  submittedAt: string;
  status: 'pending' | 'upheld' | 'overturned';
  resolvedAt?: string;
  notes?: string;
}
