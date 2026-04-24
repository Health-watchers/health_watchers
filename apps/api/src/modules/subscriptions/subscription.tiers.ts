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
