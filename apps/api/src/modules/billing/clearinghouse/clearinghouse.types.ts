import type { ClaimRemittance, ClearinghouseProvider } from '../claim.model';

/** Claim frequency code (CLM05-3 / CMS-1500 box 22): 1 original, 7 replacement, 8 void. */
export type ClaimFrequencyCode = '1' | '7' | '8';

export interface ClearinghouseSubmission {
  claimId: string;
  clinicId: string;
  edi837: string;
  totalAmount: number;
  frequencyCode: ClaimFrequencyCode;
  /** Payer claim control number of the claim being replaced (required for code 7/8) */
  originalPayerClaimId?: string;
}

export interface ClearinghouseSubmitResult {
  /** Clearinghouse-assigned tracking id */
  submissionId: string;
  /** 999/277CA acknowledgement outcome at submission time */
  accepted: boolean;
  rejectionReason?: string;
}

/**
 * Normalised claim status from a 276/277 inquiry:
 *  - pending   — received, still in adjudication
 *  - accepted  — accepted into payer adjudication
 *  - rejected  — front-end rejection (correct and resend)
 *  - denied    — adjudicated, not payable
 *  - paid      — adjudicated and paid (ERA available)
 */
export type ClearinghouseClaimStatus = 'pending' | 'accepted' | 'rejected' | 'denied' | 'paid';

export interface ClearinghouseStatusResult {
  status: ClearinghouseClaimStatus;
  payerClaimId?: string;
  message?: string;
  checkedAt: Date;
}

export type RemittanceRecord = Omit<ClaimRemittance, '_id' | 'postedAt'> & {
  submissionId: string;
};

/**
 * Adapter contract every clearinghouse integration implements. Real integrations call the
 * vendor's API; the stubs in this folder simulate it deterministically for development.
 */
export interface ClearinghouseAdapter {
  readonly provider: ClearinghouseProvider;
  submitClaim(submission: ClearinghouseSubmission): Promise<ClearinghouseSubmitResult>;
  getClaimStatus(submissionId: string): Promise<ClearinghouseStatusResult>;
  /** 835 remittances available for the given submissions */
  fetchRemittances(submissionIds: string[]): Promise<RemittanceRecord[]>;
}
