export type SubscriptionTier = 'free' | 'basic' | 'premium';

export interface TierLimits {
  maxDoctors: number;
  maxPatients: number;
  maxEncountersPerMonth: number;
  maxAiRequestsPerMonth: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    maxDoctors: 1,
    maxPatients: 100,
    maxEncountersPerMonth: 500,
    maxAiRequestsPerMonth: 0,
  },
  basic: {
    maxDoctors: 5,
    maxPatients: 1000,
    maxEncountersPerMonth: Infinity,
    maxAiRequestsPerMonth: 100,
  },
  premium: {
    maxDoctors: Infinity,
    maxPatients: Infinity,
    maxEncountersPerMonth: Infinity,
    maxAiRequestsPerMonth: Infinity,
  },
};

export const TIER_PRICES: Record<SubscriptionTier, number> = {
  free: 0,
  basic: 49,
  premium: 199,
};

export type SubscriptionFeature =
  | 'telemedicine'
  | 'aiSummaries'
  | 'surveys'
  | 'advancedReports'
  | 'apiAccess';

export const TIER_FEATURES: Record<SubscriptionTier, Record<SubscriptionFeature, boolean>> = {
  free: {
    telemedicine: false,
    aiSummaries: false,
    surveys: false,
    advancedReports: false,
    apiAccess: false,
  },
  basic: {
    telemedicine: true,
    aiSummaries: true,
    surveys: true,
    advancedReports: false,
    apiAccess: false,
  },
  premium: {
    telemedicine: true,
    aiSummaries: true,
    surveys: true,
    advancedReports: true,
    apiAccess: true,
  },
};

export function hasFeature(tier: SubscriptionTier, feature: SubscriptionFeature): boolean {
  const features = TIER_FEATURES[tier];
  if (!features) {
    return false;
  }
  return features[feature] === true;
}

export function getFeatures(tier: SubscriptionTier): SubscriptionFeature[] {
  const features = TIER_FEATURES[tier];
  if (!features) {
    return [];
  }
  return (Object.keys(features) as SubscriptionFeature[]).filter((feature) => features[feature]);
}

export interface ProrationResult {
  currentTier: SubscriptionTier;
  newTier: SubscriptionTier;
  /** Whether the change is an upgrade (new tier costs more). */
  isUpgrade: boolean;
  /** Amount already paid for the current tier that is unused, in currency units. */
  unusedCredit: number;
  /** Amount owed for the new tier for the remaining period, in currency units. */
  newTierCharge: number;
  /** Net amount to charge (positive) or credit (negative), in currency units. */
  netAmount: number;
  /** Fraction of the billing period remaining (0..1). */
  remainingFraction: number;
}

/**
 * Calculate proration for a plan change.
 *
 * @param currentTier The tier the subscription is currently on.
 * @param newTier The tier the subscription is changing to.
 * @param daysRemaining Days remaining in the current billing period.
 * @param periodDays Total length of the billing period in days.
 */
export function calculateProration(
  currentTier: SubscriptionTier,
  newTier: SubscriptionTier,
  daysRemaining: number,
  periodDays: number,
): ProrationResult {
  const safePeriodDays = periodDays > 0 ? periodDays : 0;
  const clampedRemaining = Math.max(0, Math.min(daysRemaining, safePeriodDays));
  const remainingFraction = safePeriodDays > 0 ? clampedRemaining / safePeriodDays : 0;

  const currentPrice = TIER_PRICES[currentTier] ?? 0;
  const newPrice = TIER_PRICES[newTier] ?? 0;

  const unusedCredit = roundCurrency(currentPrice * remainingFraction);
  const newTierCharge = roundCurrency(newPrice * remainingFraction);
  const netAmount = roundCurrency(newTierCharge - unusedCredit);

  return {
    currentTier,
    newTier,
    isUpgrade: newPrice > currentPrice,
    unusedCredit,
    newTierCharge,
    netAmount,
    remainingFraction,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}