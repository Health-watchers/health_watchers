export interface SurveyTrendPoint {
  period: string;
  responses: number;
  nps: number | null;
  csat: number | null;
}

export type TrendBucket = 'day' | 'week' | 'month';

export function formatPeriod(period: string, bucket: TrendBucket): string {
  const d = new Date(`${period}T00:00:00Z`);
  if (bucket === 'month') {
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
