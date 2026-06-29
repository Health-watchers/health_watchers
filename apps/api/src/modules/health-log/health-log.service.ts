import { MetricType } from './health-log.model';

interface Threshold {
  low?: number;
  high: number;
}

// Clinically accepted upper/lower bounds per metric type
const THRESHOLDS: Record<MetricType, Threshold> = {
  weight: { high: 300 }, // kg
  blood_pressure: { high: 180 }, // systolic mmHg
  blood_glucose: { low: 3.9, high: 11.1 }, // mmol/L
  exercise_minutes: { high: 300 }, // WHO upper safety limit per day
  heart_rate: { low: 40, high: 130 }, // bpm at rest
};

export function isAbnormal(metricType: MetricType, value: number): boolean {
  const t = THRESHOLDS[metricType];
  if (!t) return false;
  if (t.low !== undefined && value < t.low) return true;
  if (value > t.high) return true;
  return false;
}

export function getThresholds(): typeof THRESHOLDS {
  return THRESHOLDS;
}
