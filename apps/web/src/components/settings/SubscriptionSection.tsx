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
    trialEndsAt?: string | null;
  };
  usage: {
    patientCount: number;
    encounterCount: number;
    aiRequestCount: number;
    doctorCount: number;
  };
  limits: TierLimits;
  prices: Record<Tier, number>;
  features?: Record<Tier, string[]>;
}

interface ProrationPreview {
  amountDue: number;
  credit: number;
  nextBillingAmount: number;
  effectiveDate: string;
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

async function fetchProration(tier: Tier): Promise<ProrationPreview> {
  const res = await fetch(`/api/subscriptions/proration?tier=${encodeURIComponent(tier)}`);
  if (!res.ok) throw new Error('Failed to calculate proration');
  const body = await res.json();
  return body.data;
}

async function setCancelAtPeriodEnd(cancel: boolean): Promise<void> {
  const res = await fetch('/api/subscriptions/cancel', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelAtPeriodEnd: cancel }),
  });
  if (!res.ok) throw new Error('Failed to update cancellation');
}

function daysRemaining(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
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

  const prorationQuery = useQuery({
    queryKey: ['subscription', 'proration', confirmTier],
    queryFn: () => fetchProration(confirmTier as Tier),
    enabled: confirmTier !== null,
  });

  const cancelMutation = useMutation({
    mutationFn: setCancelAtPeriodEnd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
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

  const { subscription, usage, limits, prices, features } = data;
  const isTrialing = subscription.status === 'trialing' && !!subscription.trialEndsAt;
  const trialDaysLeft = subscription.trialEndsAt ? daysRemaining(subscription.trialEndsAt) : 0;
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

        {isTrialing && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              trialDaysLeft <= 3 ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
            }`}
          >
            {trialDaysLeft === 0
              ? '⏰ Your trial ends today. Add billing details to keep access.'
              : `🎁 Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} (${new Date(subscription.trialEndsAt as string).toLocaleDateString()}).`}
          </div>
        )}
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
        {subscription.cancelAtPeriodEnd && (
          <div className="mb-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
            Your subscription will be cancelled on{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. You can resume anytime
            before then.
          </div>
        )}

        {/* Cancellation toggle */}
        <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 p-3">
          <div>
            <p className="text-sm font-medium text-neutral-800">Cancel at period end</p>
            <p className="text-xs text-neutral-500">
              Keep access until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={subscription.cancelAtPeriodEnd}
            disabled={cancelMutation.isPending || subscription.tier === 'free'}
            onClick={() => cancelMutation.mutate(!subscription.cancelAtPeriodEnd)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              subscription.cancelAtPeriodEnd ? 'bg-primary-600' : 'bg-neutral-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                subscription.cancelAtPeriodEnd ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {cancelMutation.isError && (
          <p className="mb-4 text-sm text-red-500">
            {cancelMutation.error instanceof Error
              ? cancelMutation.error.message
              : 'Failed to update cancellation'}
          </p>
        )}

        {/* Usage */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">Current Usage</h3>
          <UsageBar label="Patients" current={usage.patientCount} limit={limits.maxPatients} />
          <UsageBar
            label="Encounters this month"
            current={usage.encounterCount}
            limit={limits.maxEncountersPerMonth}
          />
          <UsageBar
            label="AI requests this month"
            current={usage.aiRequestCount}
            limit={limits.maxAiRequestsPerMonth}
          />
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
                  <li>
                    📋 {formatLimit(TIER_LIMITS_MAP[tier].maxEncountersPerMonth)} encounters/mo
                  </li>
                  <li>
                    🤖 {formatLimit(TIER_LIMITS_MAP[tier].maxAiRequestsPerMonth)} AI requests/mo
                  </li>
                </ul>
                {features?.[tier] && features[tier].length > 0 && (
                  <ul className="mb-5 space-y-1 text-xs text-neutral-500">
                    {features[tier].map((feature) => (
                      <li key={feature}>✓ {feature}</li>
                    ))}
                  </ul>
                )}
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
            <div className="mb-6 space-y-2 text-sm text-neutral-600">
              {prices[confirmTier] === 0 ? (
                <p>You will be downgraded to the Free plan immediately.</p>
              ) : (
                <p>You will be billed ${prices[confirmTier]}/month starting next cycle.</p>
              )}
              {prorationQuery.isLoading && <p className="text-neutral-500">Calculating proration…</p>}
              {prorationQuery.isError && (
                <p className="text-red-500">Unable to calculate proration for this change.</p>
              )}
              {prorationQuery.data && (
                <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-700">
                  <div className="flex justify-between">
                    <span>Prorated charge today</span>
                    <span className="font-medium">
                      {formatCurrency(prorationQuery.data.amountDue)}
                    </span>
                  </div>
                  {prorationQuery.data.credit > 0 && (
                    <div className="flex justify-between">
                      <span>Credit from current plan</span>
                      <span className="font-medium">
                        -{formatCurrency(prorationQuery.data.credit)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1">
                    <span>Next invoice</span>
                    <span className="font-medium">
                      {formatCurrency(prorationQuery.data.nextBillingAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>
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
                disabled={mutation.isPending || prorationQuery.isLoading}
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
