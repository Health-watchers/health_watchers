import type { ClaimStatus } from './claim.model';

/**
 * Insurance claim lifecycle.
 *
 *   draft ──► submitted ──► accepted ──► paid
 *               │  ▲           │
 *               │  │           └──► denied ──► resubmitted ──► …
 *               ▼  │
 *            rejected ──► resubmitted ──► accepted / rejected / denied / paid
 *
 * - `rejected`: the clearinghouse or payer front-end bounced the claim (format/eligibility
 *   errors) — it never entered adjudication and can be corrected and resent.
 * - `denied`: the payer adjudicated the claim and refused payment (reported on the ERA).
 * - `paid`: the payer remitted payment in full or in part.
 * - `written_off`: closed without (further) payment. Terminal.
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  draft: ['submitted', 'written_off'],
  submitted: ['accepted', 'rejected', 'denied', 'paid', 'written_off'],
  resubmitted: ['accepted', 'rejected', 'denied', 'paid', 'written_off'],
  accepted: ['paid', 'denied', 'written_off'],
  rejected: ['resubmitted', 'written_off'],
  denied: ['resubmitted', 'written_off'],
  paid: [],
  written_off: [],
};

/** Statuses from which a claim may be corrected (edited) before it is sent again. */
export const CORRECTABLE_STATUSES: ClaimStatus[] = ['draft', 'rejected', 'denied'];

/** Statuses that are still awaiting a payer decision. */
export const IN_FLIGHT_STATUSES: ClaimStatus[] = ['submitted', 'resubmitted', 'accepted'];

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidClaimTransitionError extends Error {
  readonly from: ClaimStatus;
  readonly to: ClaimStatus;

  constructor(from: ClaimStatus, to: ClaimStatus) {
    super(`Cannot move a claim from "${from}" to "${to}"`);
    this.name = 'InvalidClaimTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (!canTransition(from, to)) throw new InvalidClaimTransitionError(from, to);
}

/** Encounter billing status that mirrors a claim status. */
export function encounterBillingStatusFor(
  status: ClaimStatus
): 'unbilled' | 'billed' | 'paid' | 'denied' {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'rejected':
    case 'denied':
      return 'denied';
    default:
      return 'billed';
  }
}
