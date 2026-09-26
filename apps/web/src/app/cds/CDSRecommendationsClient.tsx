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

const SEVERITY_STYLES: Record<
  AlertSeverity,
  { border: string; bg: string; badge: 'danger' | 'warning' | 'default' }
> = {
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
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-yellow-700' : 'text-red-700';
  const bgColor = pct >= 80 ? 'bg-green-50' : pct >= 60 ? 'bg-yellow-50' : 'bg-red-50';

  return (
    <div className={`rounded-lg ${bgColor} p-3`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="mb-1 text-xs font-medium text-gray-600">Confidence Score</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className={`ml-3 text-lg font-bold ${textColor}`}>{pct}%</span>
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {pct >= 80
          ? 'High confidence in this recommendation'
          : pct >= 60
            ? 'Moderate confidence in this recommendation'
            : 'Low confidence - review carefully'}
      </p>
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

  const handleCardInteraction = () => {
    setExpanded(!expanded);
    if ('analytics' in window) {
      (window as any).analytics?.trackEvent?.('cds_recommendation_viewed', {
        recommendationId: rec._id,
        severity: rec.severity,
        category: rec.category,
      });
    }
  };

  const handleAcknowledgeClick = () => {
    onAcknowledge(rec._id);
    if ('analytics' in window) {
      (window as any).analytics?.trackEvent?.('cds_recommendation_acknowledged', {
        recommendationId: rec._id,
      });
    }
  };

  return (
    <Card
      padding="none"
      className={`border-l-4 ${style.border} ${style.bg} transition-all hover:shadow-lg`}
    >
      {/* Header section */}
      <button
        onClick={handleCardInteraction}
        className="w-full p-5 text-left hover:bg-opacity-75"
        aria-expanded={expanded}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Badge variant={style.badge}>{rec.severity.toUpperCase()}</Badge>
            <span className="rounded-full bg-white bg-opacity-60 px-3 py-1 text-xs font-medium text-gray-700">
              {CATEGORY_LABEL[rec.category]}
            </span>
            <span className="rounded-full bg-white bg-opacity-60 px-3 py-1 text-xs font-medium text-gray-700">
              {ACTION_LABEL[rec.action]}
            </span>
            {rec.acknowledged && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                ✓ Acknowledged
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-gray-600">
              {new Date(rec.createdAt).toLocaleDateString()}
            </span>
            <svg
              className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>

        {/* Recommendation content */}
        <div className="mb-3">
          <p className="text-lg font-bold text-gray-900">{rec.ruleName}</p>
          <p className="mt-2 text-gray-800">{rec.message}</p>
        </div>

        {/* Confidence and patient info */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600">
          {rec.patientId && (
            <span>
              Patient:{' '}
              <span className="font-semibold">
                {rec.patientId.firstName} {rec.patientId.lastName}
              </span>
              <span className="ml-1 font-mono text-gray-500">({rec.patientId.systemId})</span>
            </span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-4 border-t border-current border-opacity-20 px-5 py-4">
          {/* Confidence Score - prominent display */}
          <ConfidenceBar score={rec.confidenceScore} />

          {/* Clinical Rationale */}
          {rec.rationale && (
            <div className="rounded-lg bg-white bg-opacity-40 p-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Clinical Rationale</h4>
              <p className="text-sm leading-relaxed text-gray-800">{rec.rationale}</p>
            </div>
          )}

          {/* Evidence References */}
          {rec.evidenceReferences && rec.evidenceReferences.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span>📚</span> Evidence References
              </h4>
              <div className="space-y-2">
                {rec.evidenceReferences.map((ref, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-current border-opacity-20 bg-white bg-opacity-60 p-4"
                  >
                    <p className="font-medium text-gray-900">{ref.title}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      <span className="font-semibold">{ref.source}</span>
                      {ref.year && <span className="ml-2">• {ref.year}</span>}
                    </p>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 underline hover:text-blue-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          if ('analytics' in window) {
                            (window as any).analytics?.trackEvent?.('evidence_reference_clicked', {
                              recommendationId: rec._id,
                              referenceUrl: ref.url,
                            });
                          }
                        }}
                      >
                        View Source →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acknowledgment info */}
          {rec.acknowledged && rec.acknowledgedAt && (
            <div className="rounded-lg bg-green-100 bg-opacity-30 p-3">
              <p className="text-xs text-green-800">
                <span className="font-semibold">✓ Acknowledged</span> on{' '}
                {new Date(rec.acknowledgedAt).toLocaleString()}
                {rec.acknowledgedBy && ` by ${rec.acknowledgedBy}`}
              </p>
            </div>
          )}

          {/* Action button */}
          {!rec.acknowledged && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAcknowledgeClick();
                }}
              >
                Acknowledge Recommendation
              </Button>
            </div>
          )}
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
  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | RuleCategory>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    data: recommendations = [],
    isLoading,
    error,
  } = useQuery<CDSRecommendation[]>({
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
    .filter((r) => (severityFilter === 'all' ? true : r.severity === severityFilter))
    .filter((r) => (categoryFilter === 'all' ? true : r.category === categoryFilter))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const unacknowledgedCount = recommendations.filter((r) => !r.acknowledged).length;
  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length;
  const warningCount = recommendations.filter((r) => r.severity === 'warning').length;

  const categories = Array.from(new Set(recommendations.map((r) => r.category)));
  const severities = Array.from(new Set(recommendations.map((r) => r.severity))) as AlertSeverity[];

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clinical Decision Support</h1>
            <p className="mt-2 text-gray-600">AI-generated recommendations and clinical alerts</p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border-l-4 border-red-500 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Critical Alerts</p>
            <p className="mt-1 text-3xl font-bold text-red-600">{criticalCount}</p>
          </div>
          <div className="rounded-lg border-l-4 border-yellow-500 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Warning Alerts</p>
            <p className="mt-1 text-3xl font-bold text-yellow-600">{warningCount}</p>
          </div>
          <div className="rounded-lg border-l-4 border-blue-500 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Total Recommendations</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{recommendations.length}</p>
          </div>
          <div className="rounded-lg border-l-4 border-green-500 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Acknowledged</p>
            <p className="mt-1 text-3xl font-bold text-green-600">
              {recommendations.filter((r) => r.acknowledged).length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card padding="none" className="mb-6">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            {(['unacknowledged', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  filter === f
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                ].join(' ')}
              >
                {f === 'all' ? '📋 All' : '⚠️ Unacknowledged'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>

            {categories.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABEL[cat]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : error ? (
        <ErrorMessage
          message="Failed to load CDS recommendations"
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['cds', 'recommendations'] })}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            filter === 'unacknowledged' ? 'No unacknowledged recommendations' : 'No recommendations'
          }
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
