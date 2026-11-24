/**
 * #1251 — Predefined report templates.
 *
 * Each template is just a canned {@link QueryDefinition} plus presentation
 * metadata. Running a template goes through the exact same safe query
 * compiler as a custom query, so there is no separate code path to keep
 * secure.
 */

import type { QueryDefinition } from './query-builder.service';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'operational' | 'clinical' | 'financial' | 'quality';
  /** Suggested visualisation for the report-builder UI. */
  visualization: 'table' | 'bar' | 'line' | 'pie' | 'kpi';
  /** `from`/`to` are filled in at run time from the request. */
  query: Omit<QueryDefinition, 'from' | 'to'>;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'patient-volume-by-month',
    name: 'Patient volume by month',
    description: 'New patient registrations bucketed by calendar month.',
    category: 'operational',
    visualization: 'line',
    query: {
      source: 'patients',
      dateBucket: 'month',
      metric: { type: 'count' },
      sort: { by: 'key', direction: 'asc' },
    },
  },
  {
    id: 'patient-risk-distribution',
    name: 'Patient risk distribution',
    description: 'Active patient count grouped by risk level.',
    category: 'clinical',
    visualization: 'pie',
    query: {
      source: 'patients',
      filter: {
        logic: 'and',
        conditions: [{ field: 'isActive', operator: 'eq', value: true }],
      },
      groupBy: ['riskLevel'],
      metric: { type: 'count' },
    },
  },
  {
    id: 'encounter-status-breakdown',
    name: 'Encounter status breakdown',
    description: 'Encounters grouped by workflow status.',
    category: 'operational',
    visualization: 'bar',
    query: {
      source: 'encounters',
      groupBy: ['status'],
      metric: { type: 'count' },
    },
  },
  {
    id: 'clinical-outcomes',
    name: 'Clinical outcomes',
    description: 'Distribution of recorded encounter outcomes.',
    category: 'quality',
    visualization: 'bar',
    query: {
      source: 'encounters',
      filter: {
        logic: 'and',
        conditions: [{ field: 'outcome', operator: 'exists', value: true }],
      },
      groupBy: ['outcome'],
      metric: { type: 'count' },
    },
  },
  {
    id: 'provider-productivity',
    name: 'Provider productivity',
    description: 'Encounter count per attending provider (top 25).',
    category: 'operational',
    visualization: 'bar',
    query: {
      source: 'encounters',
      groupBy: ['attendingDoctorId'],
      metric: { type: 'count' },
      sort: { by: 'metric', direction: 'desc' },
      limit: 25,
    },
  },
  {
    id: 'follow-up-load',
    name: 'Follow-up load',
    description: 'Encounters requiring follow-up, bucketed by month.',
    category: 'clinical',
    visualization: 'line',
    query: {
      source: 'encounters',
      filter: {
        logic: 'and',
        conditions: [{ field: 'followUpRequired', operator: 'eq', value: true }],
      },
      dateBucket: 'month',
      metric: { type: 'count' },
      sort: { by: 'key', direction: 'asc' },
    },
  },
  {
    id: 'revenue-by-month',
    name: 'Revenue by month',
    description: 'Confirmed payment value bucketed by calendar month.',
    category: 'financial',
    visualization: 'line',
    query: {
      source: 'payments',
      filter: {
        logic: 'and',
        conditions: [{ field: 'status', operator: 'eq', value: 'confirmed' }],
      },
      dateBucket: 'month',
      metric: { type: 'sum', field: 'amount' },
      sort: { by: 'key', direction: 'asc' },
    },
  },
  {
    id: 'revenue-by-asset',
    name: 'Revenue by asset',
    description: 'Confirmed payment value grouped by settlement asset.',
    category: 'financial',
    visualization: 'pie',
    query: {
      source: 'payments',
      filter: {
        logic: 'and',
        conditions: [{ field: 'status', operator: 'eq', value: 'confirmed' }],
      },
      groupBy: ['assetCode'],
      metric: { type: 'sum', field: 'amount' },
    },
  },
  {
    id: 'payment-success-rate',
    name: 'Payment attempts by status',
    description: 'All payment records grouped by final status.',
    category: 'financial',
    visualization: 'bar',
    query: {
      source: 'payments',
      groupBy: ['status'],
      metric: { type: 'count' },
    },
  },
];

export function getReportTemplate(id: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.id === id);
}
