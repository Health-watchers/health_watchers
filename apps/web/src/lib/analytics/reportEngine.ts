/**
 * Client-side helpers for building, exporting, scheduling, and sharing
 * clinic manager reports. Data fetching is left to callers (API routes);
 * this module focuses on shaping/report-definition concerns so the same
 * logic can back both the custom report builder and predefined templates.
 */

import type {
  BenchmarkComparison,
  DateRange,
  ExportFormat,
  ReportDataPoint,
  ReportDefinition,
  ReportResult,
  ReportSchedule,
  ReportShareLink,
} from './reportTypes';

export function resolveDateRange(range: DateRange): { start: Date; end: Date } {
  if (range.preset && range.preset !== 'custom') {
    const end = new Date();
    const start = new Date();
    switch (range.preset) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case 'ytd':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    return { start, end };
  }
  return { start: new Date(range.start), end: new Date(range.end) };
}

export function buildReport(
  definition: ReportDefinition,
  dataPoints: ReportDataPoint[]
): ReportResult {
  const start = performance.now();
  return {
    definition,
    dataPoints,
    generatedAt: new Date().toISOString(),
    generationMs: performance.now() - start,
  };
}

export function applyFilters(
  rows: Record<string, unknown>[],
  filters: ReportDefinition['filters']
): Record<string, unknown>[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.field];
      switch (filter.operator) {
        case 'eq':
          return value === filter.value;
        case 'neq':
          return value !== filter.value;
        case 'in':
          return Array.isArray(filter.value) && filter.value.includes(value);
        case 'gt':
          return typeof value === 'number' && value > Number(filter.value);
        case 'lt':
          return typeof value === 'number' && value < Number(filter.value);
        default:
          return true;
      }
    })
  );
}

export function groupByField(
  rows: Record<string, unknown>[],
  field: string,
  metrics: string[]
): ReportDataPoint[] {
  const groups = new Map<string, ReportDataPoint>();

  for (const row of rows) {
    const label = String(row[field] ?? 'Unknown');
    if (!groups.has(label)) {
      groups.set(label, { label, values: Object.fromEntries(metrics.map((m) => [m, 0])) });
    }
    const bucket = groups.get(label)!;
    for (const metric of metrics) {
      const value = row[metric];
      if (typeof value === 'number') {
        bucket.values[metric] += value;
      }
    }
  }

  return Array.from(groups.values());
}

/** Serializes report data for export. PDF/XLSX generation is delegated to a
 * server route; this returns a normalized payload the client can POST. */
export function prepareExportPayload(
  result: ReportResult,
  format: ExportFormat
): { format: ExportFormat; filename: string; rows: ReportDataPoint[] } {
  const safeName = result.definition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    format,
    filename: `${safeName}-${result.generatedAt.slice(0, 10)}.${format}`,
    rows: result.dataPoints,
  };
}

export function toCsv(dataPoints: ReportDataPoint[]): string {
  if (dataPoints.length === 0) return '';
  const metricKeys = Object.keys(dataPoints[0].values);
  const header = ['label', ...metricKeys].join(',');
  const lines = dataPoints.map((point) =>
    [point.label, ...metricKeys.map((key) => point.values[key] ?? 0)].join(',')
  );
  return [header, ...lines].join('\n');
}

export function createSchedule(
  reportId: string,
  cadence: ReportSchedule['cadence'],
  recipients: string[]
): ReportSchedule {
  const nextRunAt = new Date();
  if (cadence === 'daily') nextRunAt.setDate(nextRunAt.getDate() + 1);
  if (cadence === 'weekly') nextRunAt.setDate(nextRunAt.getDate() + 7);
  if (cadence === 'monthly') nextRunAt.setMonth(nextRunAt.getMonth() + 1);

  return { reportId, cadence, recipients, nextRunAt: nextRunAt.toISOString(), active: true };
}

export function createShareLink(reportId: string, readOnly = true, ttlHours = 72): ReportShareLink {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);
  const token = `${reportId}-${Math.random().toString(36).slice(2, 10)}`;
  return { reportId, token, expiresAt: expiresAt.toISOString(), readOnly };
}

export function computeBenchmark(
  metric: BenchmarkComparison['metric'],
  clinicValue: number,
  peerValues: number[]
): BenchmarkComparison {
  const peerAverage = peerValues.reduce((sum, v) => sum + v, 0) / (peerValues.length || 1);
  const below = peerValues.filter((v) => v <= clinicValue).length;
  const percentileRank = peerValues.length ? Math.round((below / peerValues.length) * 100) : 50;

  return { metric, clinicValue, peerAverage, percentileRank };
}
