'use client';

import { useMemo, useState } from 'react';
import {
  PREDEFINED_REPORT_TEMPLATES,
  type ChartType,
  type DateRange,
  type ReportDefinition,
  type ReportMetric,
} from '@/lib/analytics/reportTypes';
import {
  createSchedule,
  createShareLink,
  prepareExportPayload,
  toCsv,
  buildReport,
} from '@/lib/analytics/reportEngine';

const ALL_METRICS: ReportMetric[] = [
  'appointments',
  'revenue',
  'newPatients',
  'noShowRate',
  'avgWaitTime',
  'claimsApproved',
  'claimsDenied',
];

const CHART_TYPES: ChartType[] = ['line', 'bar', 'pie', 'table', 'kpi'];

interface ReportBuilderProps {
  onGenerate?: (definition: ReportDefinition) => void;
}

/**
 * Custom report builder for clinic managers: pick metrics, a date range,
 * a chart type, and either start from scratch or a predefined template.
 * Actual data fetching happens in the parent page via `onGenerate`.
 */
export function ReportBuilder({ onGenerate }: ReportBuilderProps) {
  const [name, setName] = useState('Untitled Report');
  const [metrics, setMetrics] = useState<ReportMetric[]>(['appointments']);
  const [chartType, setChartType] = useState<ChartType>('line');
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '', preset: '30d' });
  const [scheduleCadence, setScheduleCadence] = useState<'daily' | 'weekly' | 'monthly' | ''>('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const definition = useMemo<ReportDefinition>(
    () => ({
      id: `custom-${Date.now()}`,
      name,
      metrics,
      chartType,
      dateRange,
      filters: [],
      isTemplate: false,
      createdAt: new Date().toISOString(),
    }),
    [name, metrics, chartType, dateRange]
  );

  function toggleMetric(metric: ReportMetric) {
    setMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  }

  function applyTemplate(templateId: string) {
    const template = PREDEFINED_REPORT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setName(template.name);
    setMetrics(template.metrics);
    setChartType(template.chartType);
    setDateRange(template.dateRange);
  }

  function handleExport(format: 'csv' | 'pdf' | 'xlsx' | 'json') {
    const result = buildReport(definition, []);
    const payload = prepareExportPayload(result, format);
    if (format === 'csv') {
      const csv = toCsv(result.dataPoints);
      console.info('Prepared CSV export', payload.filename, csv.length, 'bytes');
    }
  }

  function handleSchedule() {
    if (!scheduleCadence) return;
    const schedule = createSchedule(definition.id, scheduleCadence, []);
    console.info('Scheduled report', schedule);
  }

  function handleShare() {
    const link = createShareLink(definition.id);
    setShareUrl(`/reports/shared/${link.token}`);
  }

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <div>
        <label className="block text-sm font-medium">Report name</label>
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <span className="block text-sm font-medium">Templates</span>
        <div className="mt-1 flex gap-2">
          {PREDEFINED_REPORT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="rounded border px-2 py-1 text-sm"
              onClick={() => applyTemplate(template.id)}
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium">Metrics</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {ALL_METRICS.map((metric) => (
            <label key={metric} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={metrics.includes(metric)}
                onChange={() => toggleMetric(metric)}
              />
              {metric}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium">Chart type</label>
          <select
            className="mt-1 rounded border px-2 py-1"
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
          >
            {CHART_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Date range</label>
          <select
            className="mt-1 rounded border px-2 py-1"
            value={dateRange.preset}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, preset: e.target.value as DateRange['preset'] }))
            }
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
          onClick={() => onGenerate?.(definition)}
        >
          Generate report
        </button>
        {(['csv', 'pdf', 'xlsx', 'json'] as const).map((format) => (
          <button
            key={format}
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => handleExport(format)}
          >
            Export {format.toUpperCase()}
          </button>
        ))}
        <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={handleShare}>
          Share
        </button>
      </div>

      {shareUrl && <p className="text-sm text-gray-600">Share link: {shareUrl}</p>}

      <div className="flex items-center gap-2">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={scheduleCadence}
          onChange={(e) => setScheduleCadence(e.target.value as typeof scheduleCadence)}
        >
          <option value="">No schedule</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={handleSchedule}>
          Save schedule
        </button>
      </div>
    </div>
  );
}
