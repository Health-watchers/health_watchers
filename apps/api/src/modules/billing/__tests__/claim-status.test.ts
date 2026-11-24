import {
  CLAIM_TRANSITIONS,
  InvalidClaimTransitionError,
  assertTransition,
  canTransition,
  encounterBillingStatusFor,
} from '../claim-status';
import { nextStatusFromClearinghouse } from '../claim-lifecycle.service';

jest.mock('../claim.model', () => ({ InsuranceClaimModel: {} }));
jest.mock('../../encounters/encounter.model', () => ({ EncounterModel: {} }));

describe('claim status transitions', () => {
  it.each([
    ['draft', 'submitted'],
    ['submitted', 'accepted'],
    ['submitted', 'rejected'],
    ['submitted', 'paid'],
    ['accepted', 'paid'],
    ['accepted', 'denied'],
    ['rejected', 'resubmitted'],
    ['denied', 'resubmitted'],
    ['resubmitted', 'paid'],
    ['denied', 'written_off'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ['draft', 'paid'],
    ['draft', 'accepted'],
    ['paid', 'denied'],
    ['paid', 'resubmitted'],
    ['written_off', 'submitted'],
    ['rejected', 'paid'],
    ['accepted', 'rejected'],
    ['submitted', 'resubmitted'],
  ] as const)('forbids %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidClaimTransitionError);
  });

  it('treats paid and written_off as terminal', () => {
    expect(CLAIM_TRANSITIONS.paid).toEqual([]);
    expect(CLAIM_TRANSITIONS.written_off).toEqual([]);
  });

  it('maps claim status to encounter billing status', () => {
    expect(encounterBillingStatusFor('paid')).toBe('paid');
    expect(encounterBillingStatusFor('denied')).toBe('denied');
    expect(encounterBillingStatusFor('rejected')).toBe('denied');
    expect(encounterBillingStatusFor('submitted')).toBe('billed');
  });
});

describe('nextStatusFromClearinghouse', () => {
  it('ignores pending and unchanged statuses', () => {
    expect(nextStatusFromClearinghouse('submitted', 'pending')).toBeNull();
    expect(nextStatusFromClearinghouse('accepted', 'accepted')).toBeNull();
  });
  it('applies valid transitions only', () => {
    expect(nextStatusFromClearinghouse('submitted', 'accepted')).toBe('accepted');
    expect(nextStatusFromClearinghouse('accepted', 'denied')).toBe('denied');
    expect(nextStatusFromClearinghouse('paid', 'denied')).toBeNull();
    expect(nextStatusFromClearinghouse('accepted', 'rejected')).toBeNull();
  });
});
