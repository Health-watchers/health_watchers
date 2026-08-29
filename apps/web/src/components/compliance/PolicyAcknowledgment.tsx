'use client';

import type { PolicyAcknowledgment as PolicyAcknowledgmentType } from './types';

interface PolicyAcknowledgmentProps {
  policies?: PolicyAcknowledgmentType[];
  onAcknowledge?: (policyId: string) => Promise<void>;
}

export function PolicyAcknowledgment({ policies = [], onAcknowledge }: PolicyAcknowledgmentProps) {
  const handleAcknowledge = async (policyId: string) => {
    if (!onAcknowledge) return;

    try {
      await onAcknowledge(policyId);
    } catch (error) {
      console.error('Failed to acknowledge policy:', error);
    }
  };

  const expiredPolicies = policies.filter((p) => p.status === 'expired');
  const activePolicies = policies.filter((p) => p.status === 'current');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Policy Acknowledgments</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Track employee policy acknowledgments
        </p>
      </div>

      {expiredPolicies.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/30 dark:bg-orange-900/10">
          <h4 className="mb-3 font-medium text-orange-900 dark:text-orange-200">
            {expiredPolicies.length} Expired Policies
          </h4>
          <div className="space-y-2">
            {expiredPolicies.map((policy) => (
              <div
                key={policy.id}
                className="flex items-center justify-between rounded bg-white p-3 text-sm dark:bg-neutral-800"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {policy.policyName}
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">v{policy.version}</p>
                </div>
                <button
                  onClick={() => handleAcknowledge(policy.id)}
                  className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePolicies.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-neutral-900 dark:text-neutral-100">Current Policies</h4>
          <div className="space-y-2">
            {activePolicies.map((policy) => (
              <div key={policy.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {policy.policyName}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      v{policy.version} • Acknowledged {new Date(policy.acknowledgedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-block rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">
                    Acknowledged
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {policies.length === 0 && (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          No policy acknowledgments recorded
        </p>
      )}
    </div>
  );
}
