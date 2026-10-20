'use client';

import { formatDate } from '@/lib/utils';
import { formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import { FLAG_LABELS } from './LabResultsTable';
import type { LabFinding } from '@/lib/lab-results/types';

export interface CriticalValueBannerProps {
  findings: readonly LabFinding[];
}

/**
 * Issue #1313 — critical value highlighting.
 * Rendered at the top of the results view so out-of-range critical results are
 * announced immediately rather than scrolled to.
 */
export function CriticalValueBanner({ findings }: CriticalValueBannerProps) {
  if (findings.length === 0) return null;

  return (
    <section
      role="alert"
      aria-label="Critical lab values"
      className="border-danger-300 bg-danger-50 rounded-lg border p-4 dark:border-danger-800 dark:bg-danger-900/30"
    >
      <h2 className="text-danger-700 dark:text-danger-300 text-sm font-semibold">
        {findings.length} critical value{findings.length === 1 ? '' : 's'} require review
      </h2>
      <ul className="mt-2 space-y-2">
        {findings.map((finding) => (
          <li
            key={`${finding.setId}-${finding.analyte}`}
            className="text-sm text-neutral-800 dark:text-neutral-100"
          >
            <span className="font-semibold">{finding.name}</span>{' '}
            {formatAnalyteValue(finding.definition, finding.value)} {finding.unit} (
            {FLAG_LABELS[finding.flag]}, reference {finding.referenceRange}) —{' '}
            {formatDate(finding.collectedAt)}, {finding.panel}
            <span className="text-danger-700 dark:text-danger-300 block text-xs">
              {finding.flag === 'critical_high'
                ? finding.definition.highMeaning
                : finding.definition.lowMeaning}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
