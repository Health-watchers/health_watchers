'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  PageWrapper,
  Toast,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';
import type { AlertSeverity, AlertAction, RuleCategory } from '@/types/cds';

interface EvidenceReference {
  title: string;
  source: string;
  url?: string;
  year?: number;
}

interface CDSRecommendation {
  _id: string;
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  severity: AlertSeverity;
  action: AlertAction;
  message: string;
  confidenceScore: number;
  rationale?: string;
  evidenceReferences?: EvidenceReference[];
  patientId?: { firstName: string; lastName: string; systemId: string };
  encounterId?: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
}

interface RecommendationsResponse {
  status: string;
  data: CDSRecommendation[];
}

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; bg: string; badge: 'danger' | 'warning' | 'default' }> = {
  critical: { border: 'border-danger-300', bg: 'bg-danger-50', badge: 'danger' },
  warning: { border: 'border-warning-300', bg: 'bg-warning-50', badge: 'warning' },
  info: { border: 'border-primary-200', bg: 'bg-primary-50', badge: 'default' },
};

const CATEGORY_LABEL: Record<RuleCategory, string> = {
  drug_interaction: 'Drug Interaction',
  screening: 'Screening',
  vital_sign: 'Vital Sign',
  care_gap: 'Care Gap',
  allergy: 'Allergy',
};

const ACTION_LABEL: Record<AlertAction, string> = {
  alert: 'Alert',
  recommendation: 'Recommendation',
  block: 'Block',
};

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? 'bg-success-500' : pct >= 50 ? 'bg-warning-500' : 'bg-danger-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-neutral-600">{pct}%</span>
    </div>
  );
}

function RecommendationCard({
  rec,
  onAcknowledge,
}: {
  rec: CDSRecommendation;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[rec.severity];

  return (
    <Card
      padding="none"
      className={`border ${style.border} ${style.bg} transition-shadow hover:shadow-md`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={style.badge}>{rec.severity}</Badge>
          <span className="rounded-sm bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {CATEGORY_LABEL[rec.category]}
          </span>
          <span className="rounded-sm bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {ACTION_LABEL[rec.action]}
          </span>
          {rec.acknowledged && (
            <span className="rounded-sm bg-success-50 px-2 py-0.5 text-xs text-success-700">
              Acknowledged
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-neutral-400">
          {new Date(rec.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Rule name + message */}
      <div className="px-5 pt-3">
        <p className="text-sm font-semibold text-neutral-800">{rec.ruleName}</p>
        <p className="mt-1 text-sm text-neutral-700">{rec.message}</p>
      </div>

      {/* Confidence score */}
      <div className="flex items-center gap-3 px-5 pt-3">
        <span className="text-xs text-neutral-500">Confidence:</span>
        <ConfidenceBar score={rec.confidenceScore} />
      </div>

      {/* Patient link if present */}
      {rec.patientId && (
        <div className="px-5 pt-2">
          <span className="text-xs text-neutral-500">
            Patient: {rec.patientId.firstName} {rec.patientId.lastName}
            <span className="ml-1 font-mono text-neutral-400">({rec.patientId.systemId})</span>
          </span>
        </div>
      )}

      {/* Collapsible details toggle */}
      <div className="px-5 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
          aria-expanded={expanded}
        >
          <svg
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Collapsible section */}
      {expanded && (
        <div className="space-y-4 px-5 py-4">
          {rec.rationale && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Clinical Rationale
              </h4>
              <p className="text-sm text-neutral-700">{rec.rationale}</p>
            </div>
          )}

          {rec.evidenceReferences && rec.evidenceReferences.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Evidence References
              </h4>
              <ul className="space-y-2">
                {rec.evidenceReferences.map((ref, idx) => (
                  <li key={idx} className="rounded-md border border-neutral-200 bg-white p-3">
                    <p className="text-sm font-medium text-neutral-800">{ref.title}</p>
                    <p className="text-xs text-neutral-500">
                      {ref.source}
                      {ref.year ? `, ${ref.year}` : ''}
                    </p>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-xs text-primary-600 hover:underline"
                      >
                        View source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec.acknowledged && rec.acknowledgedAt && (
            <p className="text-xs text-neutral-400">
              Acknowledged {new Date(rec.acknowledgedAt).toLocaleString()}
              {rec.acknowledgedBy ? ` by ${rec.acknowledgedBy}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {!rec.acknowledged && (
        <div className="border-t border-neutral-200 px-5 py-3">
          <Button size="sm" variant="secondary" onClick={() => onAcknowledge(rec._id)}>
            Acknowledge
          </Button>
        </div>
      )}
    </Card>
  );
}

async function fetchRecommendations(): Promise<CDSRecommendation[]> {
  const res = await fetch(`${API_V1}/cds/recommendations`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load CDS recommendations');
  const body: RecommendationsResponse = await res.json();
  return body.data ?? [];
}

const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'warning', 'info'];

export default function CDSRecommendationsClient() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unacknowledged'>('unacknowledged');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: recommendations = [], isLoading, error } = useQuery<CDSRecommendation[]>({
    queryKey: ['cds', 'recommendations'],
    queryFn: fetchRecommendations,
  });

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/cds/recommendations/${id}/acknowledge`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setToast({ message: 'Recommendation acknowledged', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['cds', 'recommendations'] });
    } catch {
      setToast({ message: 'Failed to acknowledge recommendation', type: 'error' });
    }
  };

  const filtered = recommendations
    .filter((r) => (filter === 'unacknowledged' ? !r.acknowledged : true))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const unacknowledgedCount = recommendations.filter((r) => !r.acknowledged).length;

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Clinical Decision Support</h1>
          <p className="mt-1 text-sm text-neutral-500">AI-generated recommendations and alerts</p>
        </div>
        {unacknowledgedCount > 0 && (
          <Badge variant="danger">{unacknowledgedCount} unacknowledged</Badge>
        )}
      </div>

      {/* Filter bar */}
      <Card padding="none" className="mb-6">
        <CardContent className="flex gap-2 p-3">
          {(['unacknowledged', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              ].join(' ')}
            >
              {f === 'all' ? 'All' : 'Unacknowledged'}
            </button>
          ))}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : error ? (
        <ErrorMessage
          message="Failed to load CDS recommendations"
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['cds', 'recommendations'] })}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === 'unacknowledged' ? 'No unacknowledged recommendations' : 'No recommendations'}
          icon="✅"
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((rec) => (
            <RecommendationCard key={rec._id} rec={rec} onAcknowledge={handleAcknowledge} />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
