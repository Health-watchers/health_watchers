'use client';

import type { Consent } from './types';

interface ConsentManagerProps {
  consents?: Consent[];
  onRevoke?: (consentId: string) => Promise<void>;
}

const CONSENT_TYPE_LABELS: Record<Consent['type'], string> = {
  treatment: 'Treatment',
  research: 'Research',
  marketing: 'Marketing',
  data_sharing: 'Data Sharing',
};

export function ConsentManager({ consents = [], onRevoke }: ConsentManagerProps) {
  const handleRevoke = async (consentId: string) => {
    if (!onRevoke) return;
    if (!confirm('Are you sure you want to revoke this consent?')) return;

    try {
      await onRevoke(consentId);
    } catch (error) {
      console.error('Failed to revoke consent:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Patient Consents</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Manage patient consent records
        </p>
      </div>

      <div className="space-y-2">
        {consents.length > 0 ? (
          consents.map((consent) => (
            <div
              key={consent.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {CONSENT_TYPE_LABELS[consent.type]}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Patient: {consent.patientId}
                  </p>
                  {consent.documentPath && (
                    <a
                      href={consent.documentPath}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View Document
                    </a>
                  )}
                </div>
                <div className="text-right text-xs text-neutral-600 dark:text-neutral-400">
                  <div>
                    Status:{' '}
                    <span
                      className={consent.status === 'active' ? 'text-green-600' : 'text-red-600'}
                    >
                      {consent.status}
                    </span>
                  </div>
                  <div>{new Date(consent.consentedAt).toLocaleDateString()}</div>
                  {consent.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(consent.id)}
                      className="mt-1 text-red-600 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            No consents recorded
          </p>
        )}
      </div>
    </div>
  );
}
