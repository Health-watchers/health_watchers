import { LabResultEntry } from './lab-result.model';

interface CriticalValueThreshold {
  parameter: string;
  criticalLow?: number;
  criticalHigh?: number;
}

// Standard critical value thresholds for common lab tests
const CRITICAL_THRESHOLDS: CriticalValueThreshold[] = [
  { parameter: 'Potassium', criticalLow: 2.5, criticalHigh: 6.5 },
  { parameter: 'Glucose', criticalLow: 40, criticalHigh: 500 },
  { parameter: 'Hemoglobin', criticalLow: 5.0, criticalHigh: undefined },
  { parameter: 'Hematocrit', criticalLow: 15, criticalHigh: undefined },
  { parameter: 'Platelet Count', criticalLow: 20, criticalHigh: undefined },
  { parameter: 'WBC', criticalLow: 2.0, criticalHigh: 30 },
  { parameter: 'Sodium', criticalLow: 120, criticalHigh: 160 },
  { parameter: 'Calcium', criticalLow: 6.5, criticalHigh: 13 },
  { parameter: 'Magnesium', criticalLow: 1.0, criticalHigh: 4.0 },
  { parameter: 'Phosphate', criticalLow: 1.0, criticalHigh: 8.0 },
  { parameter: 'Creatinine', criticalLow: undefined, criticalHigh: 10 },
  { parameter: 'BUN', criticalLow: undefined, criticalHigh: 100 },
  { parameter: 'Bilirubin', criticalLow: undefined, criticalHigh: 10 },
  { parameter: 'INR', criticalLow: undefined, criticalHigh: 4.0 },
  { parameter: 'Troponin', criticalLow: undefined, criticalHigh: 0.5 },
  { parameter: 'Lactate', criticalLow: undefined, criticalHigh: 5.0 },
];

export function detectCriticalValues(results: LabResultEntry[]): {
  isCritical: boolean;
  criticalReason?: string;
} {
  if (!results || results.length === 0) {
    return { isCritical: false };
  }

  for (const result of results) {
    const threshold = CRITICAL_THRESHOLDS.find(
      (t) => t.parameter.toLowerCase() === result.parameter.toLowerCase()
    );

    if (!threshold) continue;

    const value = parseFloat(result.value);
    if (isNaN(value)) continue;

    if (threshold.criticalLow !== undefined && value < threshold.criticalLow) {
      return {
        isCritical: true,
        criticalReason: `${result.parameter} critically low: ${result.value} ${result.unit} (threshold: < ${threshold.criticalLow})`,
      };
    }

    if (threshold.criticalHigh !== undefined && value > threshold.criticalHigh) {
      return {
        isCritical: true,
        criticalReason: `${result.parameter} critically high: ${result.value} ${result.unit} (threshold: > ${threshold.criticalHigh})`,
      };
    }
  }

  return { isCritical: false };
}
