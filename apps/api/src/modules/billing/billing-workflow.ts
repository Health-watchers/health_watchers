export type BillingStatus = 'unbilled' | 'billed' | 'paid' | 'denied' | 'resubmitted';

const VALID_TRANSITIONS: Record<BillingStatus, BillingStatus[]> = {
  unbilled:     ['billed'],
  billed:       ['paid', 'denied'],
  paid:         [],
  denied:       ['resubmitted'],
  resubmitted:  ['billed', 'paid', 'denied'],
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function canTransition(from: BillingStatus, to: BillingStatus): TransitionResult {
  const allowed = VALID_TRANSITIONS[from]?.includes(to) ?? false;
  if (!allowed) {
    return {
      allowed: false,
      reason: `Invalid billing transition: "${from}" → "${to}". ` +
              `Allowed next states from "${from}": [${(VALID_TRANSITIONS[from] ?? []).join(', ') || 'none'}]`,
    };
  }
  return { allowed: true };
}

export function assertValidTransition(from: BillingStatus, to: BillingStatus): void {
  const result = canTransition(from, to);
  if (!result.allowed) {
    throw Object.assign(new Error(result.reason), { statusCode: 400 });
  }
}
