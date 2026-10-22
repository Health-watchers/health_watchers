import { createHash, randomUUID } from 'crypto';
import type { ClearinghouseProvider } from '../claim.model';
import type {
  ClearinghouseAdapter,
  ClearinghouseClaimStatus,
  ClearinghouseStatusResult,
  ClearinghouseSubmission,
  ClearinghouseSubmitResult,
  RemittanceRecord,
} from './clearinghouse.types';

interface StubRecord {
  submission: ClearinghouseSubmission;
  submittedAt: Date;
  /** Outcome chosen at submission time so repeated polls are stable */
  outcome: ClearinghouseClaimStatus;
  payerClaimId: string;
}

/**
 * In-memory clearinghouse simulator shared by the Availity and Change Healthcare stubs.
 *
 * Outcomes are derived from a hash of the claim id so the same claim always follows the same
 * path: ~70 % paid, ~15 % denied, ~10 % accepted-and-pending, ~5 % front-end rejected.
 * Status advances with time since submission (`settleAfterMs`) to mimic adjudication delay.
 * Claims whose EDI lacks a service line (`SV1`) are always rejected.
 */
export class StubClearinghouse implements ClearinghouseAdapter {
  private readonly records = new Map<string, StubRecord>();

  constructor(
    readonly provider: ClearinghouseProvider,
    private readonly payerName: string,
    private readonly settleAfterMs = 0
  ) {}

  async submitClaim(submission: ClearinghouseSubmission): Promise<ClearinghouseSubmitResult> {
    const submissionId = `${this.prefix()}-${randomUUID()}`;

    if (!submission.edi837.includes('SV1*')) {
      this.records.set(submissionId, {
        submission,
        submittedAt: new Date(),
        outcome: 'rejected',
        payerClaimId: '',
      });
      return { submissionId, accepted: false, rejectionReason: '999 AK9*R — missing service line (SV1)' };
    }

    const bucket = parseInt(createHash('sha1').update(submission.claimId).digest('hex').slice(0, 4), 16) % 100;
    // Corrected claims are assumed to fix the denial cause
    const outcome: ClearinghouseClaimStatus =
      submission.frequencyCode === '7'
        ? 'paid'
        : bucket < 70
          ? 'paid'
          : bucket < 85
            ? 'denied'
            : bucket < 95
              ? 'accepted'
              : 'rejected';

    this.records.set(submissionId, {
      submission,
      submittedAt: new Date(),
      outcome,
      payerClaimId: `ICN${bucket.toString().padStart(2, '0')}${Date.now().toString().slice(-9)}`,
    });

    return outcome === 'rejected'
      ? { submissionId, accepted: false, rejectionReason: '277CA A7:21 — invalid subscriber ID' }
      : { submissionId, accepted: true };
  }

  async getClaimStatus(submissionId: string): Promise<ClearinghouseStatusResult> {
    const record = this.records.get(submissionId);
    const checkedAt = new Date();
    if (!record) {
      return { status: 'pending', message: 'Submission not found at clearinghouse', checkedAt };
    }
    const settled = checkedAt.getTime() - record.submittedAt.getTime() >= this.settleAfterMs;
    if (!settled || record.outcome === 'accepted') {
      return { status: record.outcome === 'rejected' ? 'rejected' : 'accepted', payerClaimId: record.payerClaimId, checkedAt };
    }
    return {
      status: record.outcome,
      payerClaimId: record.payerClaimId || undefined,
      message: record.outcome === 'denied' ? 'CARC 50 — not deemed a medical necessity' : undefined,
      checkedAt,
    };
  }

  async fetchRemittances(submissionIds: string[]): Promise<RemittanceRecord[]> {
    const out: RemittanceRecord[] = [];
    for (const id of submissionIds) {
      const record = this.records.get(id);
      if (!record || (record.outcome !== 'paid' && record.outcome !== 'denied')) continue;
      const status = await this.getClaimStatus(id);
      if (status.status !== 'paid' && status.status !== 'denied') continue;

      const billed = record.submission.totalAmount;
      const eraId = `ERA-${this.prefix()}-${id.slice(-8)}`;
      if (record.outcome === 'denied') {
        out.push({
          submissionId: id,
          eraId,
          payerName: this.payerName,
          paymentMethod: 'NON',
          claimStatusCode: '4',
          billedAmount: billed,
          allowedAmount: 0,
          paidAmount: 0,
          patientResponsibility: 0,
          adjustments: [{ groupCode: 'CO', reasonCode: '50', amount: billed, remarkCode: 'N115' }],
          receivedAt: new Date(),
        });
        continue;
      }

      const allowed = Math.round(billed * 0.8 * 100) / 100;
      const patientResp = Math.round(allowed * 0.2 * 100) / 100;
      const paid = Math.round((allowed - patientResp) * 100) / 100;
      out.push({
        submissionId: id,
        eraId,
        payerName: this.payerName,
        checkNumber: `EFT${Date.now().toString().slice(-8)}`,
        paymentMethod: 'ACH',
        claimStatusCode: '1',
        billedAmount: billed,
        allowedAmount: allowed,
        paidAmount: paid,
        patientResponsibility: patientResp,
        adjustments: [
          { groupCode: 'CO', reasonCode: '45', amount: Math.round((billed - allowed) * 100) / 100 },
          ...(patientResp > 0 ? [{ groupCode: 'PR' as const, reasonCode: '2', amount: patientResp }] : []),
        ],
        receivedAt: new Date(),
      });
    }
    return out;
  }

  /** Test helper — forget all simulated submissions. */
  reset() {
    this.records.clear();
  }

  private prefix() {
    return this.provider === 'availity' ? 'AV' : this.provider === 'change_healthcare' ? 'CHC' : 'MOCK';
  }
}
