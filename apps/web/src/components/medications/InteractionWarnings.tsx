'use client';

import { Badge } from '@/components/ui';
import { SEVERITY_LABELS, severityBadgeVariant } from '@/lib/medications/labels';
import type { InteractionCheck } from '@/lib/medications/types';

export interface InteractionWarningsProps {
  checks: readonly InteractionCheck[];
  /** Render a positive confirmation when no interactions are found. */
  showAllClear?: boolean;
  title?: string;
}

function itemClasses(severity: InteractionCheck['severity']): string {
  if (severity === 'contraindicated' || severity === 'major') {
    return 'border-danger-200 bg-danger-50';
  }
  if (severity === 'moderate') return 'border-warning-200 bg-warning-50';
  return 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800';
}

/**
 * Issue #1314 — real-time drug interaction warnings.
 * Rendered inline beneath the medication search so warnings appear the moment a
 * drug is selected, without waiting for a form submission.
 */
export function InteractionWarnings({
  checks,
  showAllClear = false,
  title = 'Interaction warnings',
}: InteractionWarningsProps) {
  if (checks.length === 0) {
    if (!showAllClear) return null;
    return (
      <p
        role="status"
        className="bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300 rounded-lg px-3 py-2 text-sm"
      >
        No known interactions with the patient&rsquo;s active medications.
      </p>
    );
  }

  return (
    <section aria-label={title} role="alert" className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        {title} ({checks.length})
      </h3>
      <ul className="space-y-2">
        {checks.map((check) => (
          <li
            key={`${check.interactionId}-${check.medicationId}`}
            className={['rounded-lg border p-3', itemClasses(check.severity)].join(' ')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={severityBadgeVariant(check.severity)}>
                {SEVERITY_LABELS[check.severity]}
              </Badge>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {check.candidateName} + {check.medicationName}
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
              {check.description}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">Action: </span>
              {check.management}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
