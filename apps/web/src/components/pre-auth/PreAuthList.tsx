'use client';

import { useState } from 'react';
import { usePreAuths, useApprovePreAuth, useClaimPreAuth, useDenyPreAuth } from '@/lib/queries/usePreAuth';
import { PreAuthStatusBadge } from './PreAuthStatusBadge';

const STATUS_TABS = ['pending', 'approved', 'denied', 'claimed', 'reclaimed'] as const;

export function PreAuthList() {
  const [activeStatus, setActiveStatus] = useState<string>('pending');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [preAuthNumber, setPreAuthNumber] = useState('');

  const { data: preAuths = [], isLoading } = usePreAuths(activeStatus);
  const approve = useApprovePreAuth();
  const claim = useClaimPreAuth();
  const deny = useDenyPreAuth();

  const handleApprove = async (id: string) => {
    if (!preAuthNumber.trim()) return;
    await approve.mutateAsync({ id, preAuthNumber });
    setApprovingId(null);
    setPreAuthNumber('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Insurance Pre-Authorizations</h2>

      {/* Status tabs */}
      <div className="flex gap-2 border-b">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`px-3 py-2 text-sm capitalize transition-colors ${
              activeStatus === s
                ? 'border-b-2 border-blue-600 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}

      {!isLoading && preAuths.length === 0 && (
        <p className="text-sm text-gray-500">No {activeStatus} pre-authorizations.</p>
      )}

      <ul className="divide-y rounded-lg border">
        {preAuths.map((pa) => (
          <li key={pa._id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">CPT: {pa.procedureCode}</span>
                <span className="ml-2 text-xs text-gray-500">{pa.insuranceProvider}</span>
              </div>
              <PreAuthStatusBadge status={pa.status} />
            </div>

            <div className="text-xs text-gray-600 space-y-0.5">
              <p>Amount: <strong>{pa.estimatedAmount} XLM</strong></p>
              {pa.preAuthNumber && <p>Pre-auth #: {pa.preAuthNumber}</p>}
              <p>Expires: {new Date(pa.expiresAt).toLocaleDateString()}</p>
              {pa.claimableBalanceId && (
                <p className="truncate">Balance ID: {pa.claimableBalanceId}</p>
              )}
            </div>

            {/* Approve flow */}
            {pa.status === 'pending' && (
              <div className="flex gap-2 pt-1">
                {approvingId === pa._id ? (
                  <>
                    <input
                      type="text"
                      placeholder="Pre-auth number from insurer"
                      value={preAuthNumber}
                      onChange={(e) => setPreAuthNumber(e.target.value)}
                      className="flex-1 rounded border px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => handleApprove(pa._id)}
                      disabled={approve.isPending}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setApprovingId(null)}
                      className="rounded border px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setApprovingId(pa._id)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => deny.mutate(pa._id)}
                      disabled={deny.isPending}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Claim flow */}
            {pa.status === 'approved' && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => claim.mutate(pa._id)}
                  disabled={claim.isPending}
                  className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Claim Funds
                </button>
                <button
                  onClick={() => deny.mutate(pa._id)}
                  disabled={deny.isPending}
                  className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
