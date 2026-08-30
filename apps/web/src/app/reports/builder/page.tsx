'use client';

import { useState } from 'react';
import { ReportBuilder } from '@/components/analytics/ReportBuilder';
import type { ReportDefinition } from '@/lib/analytics/reportTypes';

/**
 * Clinic manager analytics page: custom report builder with predefined
 * templates, export, scheduling, and sharing. Intended to be mobile
 * responsive via the surrounding layout's existing breakpoints.
 */
export default function ReportBuilderPage() {
  const [lastGenerated, setLastGenerated] = useState<ReportDefinition | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Report Builder</h1>
        <p className="text-sm text-gray-600">
          Build custom reports or start from a predefined template. Reports include
          filtering, drill-down, export, scheduling, sharing, and benchmark comparisons.
        </p>
      </div>

      <ReportBuilder onGenerate={setLastGenerated} />

      {lastGenerated && (
        <div className="rounded-lg border p-4">
          <h2 className="font-medium">Preview: {lastGenerated.name}</h2>
          <p className="text-sm text-gray-600">
            Metrics: {lastGenerated.metrics.join(', ')} &middot; Chart: {lastGenerated.chartType}
          </p>
        </div>
      )}
    </div>
  );
}
