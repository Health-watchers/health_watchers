/**
 * Types for the clinic manager analytics/reporting interface.
 */

export type ReportMetric =
  | 'appointments'
  | 'revenue'
  | 'newPatients'
  | 'noShowRate'
  | 'avgWaitTime'
  | 'claimsApproved'
  | 'claimsDenied';

export type ChartType = 'line' | 'bar' | 'pie' | 'table' | 'kpi';

export type ExportFormat = 'csv' | 'pdf' | 'xlsx' | 'json';

export interface DateRange {
  start: string;
  end: string;
  preset?: 'today' | '7d' | '30d' | '90d' | 'ytd' | 'custom';
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt';
  value: unknown;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description?: string;
  metrics: ReportMetric[];
  chartType: ChartType;
  dateRange: DateRange;
  filters: ReportFilter[];
  groupBy?: string;
  isTemplate: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface ReportSchedule {
  reportId: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  nextRunAt: string;
  active: boolean;
}

export interface ReportShareLink {
  reportId: string;
  token: string;
  expiresAt: string;
  readOnly: boolean;
}

export interface BenchmarkComparison {
  metric: ReportMetric;
  clinicValue: number;
  peerAverage: number;
  percentileRank: number;
}

export interface ReportDataPoint {
  label: string;
  values: Record<string, number>;
}

export interface ReportResult {
  definition: ReportDefinition;
  dataPoints: ReportDataPoint[];
  generatedAt: string;
  generationMs: number;
}

export const PREDEFINED_REPORT_TEMPLATES: ReportDefinition[] = [
  {
    id: 'tpl-daily-volume',
    name: 'Daily Patient Volume',
    description: 'Appointments and new patients per day',
    metrics: ['appointments', 'newPatients'],
    chartType: 'line',
    dateRange: { start: '', end: '', preset: '30d' },
    filters: [],
    isTemplate: true,
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-revenue-summary',
    name: 'Revenue Summary',
    description: 'Revenue and claims approval trends',
    metrics: ['revenue', 'claimsApproved', 'claimsDenied'],
    chartType: 'bar',
    dateRange: { start: '', end: '', preset: '90d' },
    filters: [],
    isTemplate: true,
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-no-show',
    name: 'No-Show & Wait Time',
    description: 'Operational efficiency metrics',
    metrics: ['noShowRate', 'avgWaitTime'],
    chartType: 'kpi',
    dateRange: { start: '', end: '', preset: '7d' },
    filters: [],
    isTemplate: true,
    createdAt: new Date(0).toISOString(),
  },
];
