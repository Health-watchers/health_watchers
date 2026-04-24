'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type Tier = 'free' | 'basic' | 'premium';

interface TierLimits {
  maxDoctors: number;
  maxPatients: number;
  maxEncountersPerMonth: number;
  maxAiRequestsPerMonth: number;
}

interface SubscriptionData {
  subscription: {
    tier: Tier;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  usage: {
    patientCount: number;
    encounterCount: number;
    aiRequestCount: number;
    doctorCount: number;
  };
  limits: TierLimits;
  prices: Record<Tier, number>;
}

const TIER_LABELS: Record<Tier, string> = { free: 'Free', basic: 'Basic', premium: 'Premium' };
const TIER_ORDER: Tier[] = ['free', 'basic', 'premium'];

function formatLimit(val: number) {
  return val === Infinity || val >= 999999 ? 'Unlimited' : val.toString();
}

async function fetchSubscription(): Promise<SubscriptionData> {
  const res = await fetch('/api/subscriptions/me');
  if (!res.ok) throw new Error('Failed to load subscription');
  const body = await res.json();
  return body.data;
}

async function changeTier(tier: Tier): Promise<void> {
  const res = await fetch('/api/subscriptions/tier', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) throw new Error('Failed to update tier');
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit === Infinity || limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const isNearLimit = !isUnlimited && pct >= 80;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">{label}</span>
        <span className={isNearLimit ? 'font-medium text-amber-600' : 'text-neutral-500'}>
          {current} / {formatLimit(limit)}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? 'bg-amber-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SubscriptionSection() {
  const queryClient = useQueryClient();
  const [confirmTier, setConfirmTier] = useState<Tier | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
  });

  const mutation = useMutation({
    mutationFn: changeTier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      setConfirmTier(null);
    },
  });

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-neutral-500">Loading subscription…</div>;
  }

  if (error || !data) {
    return (
      <div className="py-8 text-center text-sm text-red-500">
        {error instanceof Error ? error.message : 'Failed to load subscription.'}
      </div>
    );
  }

  const { subscription, usage, limits, prices } = data;
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    cancelled: 'bg-neutral-100 text-neutral-600',
  };

  return (
    <div className="space-y-8">
      {/* Current plan */}
      <section className="rounded-lg border border-neutral-200 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {TIER_LABELS[subscription.tier]} Plan
            </h2>
            <p className="text-sm text-neutral-500">
              Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColors[subscription.status] ?? 'bg-neutral-100 text-neutral-600'}`}
          >
            {subscription.status.replace('_', ' ')}
          </span>
        </div>

        {subscription.status === 'past_due' && (
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ Payment is overdue. Please update your billing to avoid account suspension.
          </div>
        )}
        {subscription.status === 'suspended' && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
            🚫 Your account is suspended. Upgrade your plan to restore access.
          </div>
        )}

        {/* Usage */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">Current Usage</h3>
          <UsageBar label="Patients" current={usage.patientCount} limit={limits.maxPatients} />
          <UsageBar label="Encounters this month" current={usage.encounterCount} limit={limits.maxEncountersPerMonth} />
          <UsageBar label="AI requests this month" current={usage.aiRequestCount} limit={limits.maxAiRequestsPerMonth} />
          <UsageBar label="Doctors" current={usage.doctorCount} limit={limits.maxDoctors} />
        </div>
      </section>

      {/* Plan selection */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-neutral-900">Change Plan</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const isCurrent = tier === subscription.tier;
            const isUpgrade = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(subscription.tier);
            return (
              <div
                key={tier}
                className={`rounded-lg border p-5 ${isCurrent ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white'}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-neutral-900">{TIER_LABELS[tier]}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                      Current
                    </span>
                  )}
                </div>
                <p className="mb-4 text-2xl font-bold text-neutral-900">
                  {prices[tier] === 0 ? 'Free' : `$${prices[tier]}/mo`}
                </p>
                <ul className="mb-5 space-y-1.5 text-sm text-neutral-600">
                  <li>👤 {formatLimit(TIER_LIMITS_MAP[tier].maxDoctors)} doctors</li>
                  <li>🏥 {formatLimit(TIER_LIMITS_MAP[tier].maxPatients)} patients</li>
                  <li>📋 {formatLimit(TIER_LIMITS_MAP[tier].maxEncountersPerMonth)} encounters/mo</li>
                  <li>🤖 {formatLimit(TIER_LIMITS_MAP[tier].maxAiRequestsPerMonth)} AI requests/mo</li>
                </ul>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => setConfirmTier(tier)}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      isUpgrade
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    {isUpgrade ? 'Upgrade' : 'Downgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Confirm modal */}
      {confirmTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-neutral-900">
              Switch to {TIER_LABELS[confirmTier]} Plan?
            </h3>
            <p className="mb-6 text-sm text-neutral-600">
              {prices[confirmTier] === 0
                ? 'You will be downgraded to the Free plan immediately.'
                : `You will be billed $${prices[confirmTier]}/month starting next cycle.`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTier(null)}
                className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(confirmTier)}
                className="flex-1 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {mutation.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
            {mutation.isError && (
              <p className="mt-3 text-center text-sm text-red-500">
                {mutation.error instanceof Error ? mutation.error.message : 'Something went wrong'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Static limits map for display (avoids needing to pass from API for the plan cards)
const TIER_LIMITS_MAP: Record<Tier, TierLimits> = {
  free: { maxDoctors: 1, maxPatients: 100, maxEncountersPerMonth: 500, maxAiRequestsPerMonth: 0 },
  basic: { maxDoctors: 5, maxPatients: 1000, maxEncountersPerMonth: Infinity, maxAiRequestsPerMonth: 100 },
  premium: { maxDoctors: Infinity, maxPatients: Infinity, maxEncountersPerMonth: Infinity, maxAiRequestsPerMonth: Infinity },
};
