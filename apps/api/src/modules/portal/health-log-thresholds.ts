import { MetricType } from '../portal/models/patient-health-log.model';

interface ThresholdResult {
  isAlert: boolean;
  reason?: string;
}

/** Returns alert status based on commonly accepted clinical thresholds. */
export function checkThreshold(
  metricType: MetricType,
  value: number,
  valueDiastolic?: number
): ThresholdResult {
  switch (metricType) {
    case 'blood_pressure': {
      // value = systolic, valueDiastolic = diastolic
      const systolic = value;
      const diastolic = valueDiastolic ?? 0;
      if (systolic >= 180 || diastolic >= 120) {
        return { isAlert: true, reason: 'Hypertensive crisis: BP ≥ 180/120 mmHg' };
      }
      if (systolic >= 140 || diastolic >= 90) {
        return { isAlert: true, reason: 'High blood pressure: BP ≥ 140/90 mmHg' };
      }
      if (systolic < 90) {
        return { isAlert: true, reason: 'Low blood pressure: systolic < 90 mmHg' };
      }
      return { isAlert: false };
    }
    case 'blood_glucose': {
      // value in mg/dL
      if (value >= 400) return { isAlert: true, reason: 'Critical hyperglycaemia: glucose ≥ 400 mg/dL' };
      if (value >= 250) return { isAlert: true, reason: 'High blood glucose: ≥ 250 mg/dL' };
      if (value < 54)   return { isAlert: true, reason: 'Severe hypoglycaemia: glucose < 54 mg/dL' };
      if (value < 70)   return { isAlert: true, reason: 'Low blood glucose: < 70 mg/dL' };
      return { isAlert: false };
    }
    case 'weight': {
      // Flag only extreme outliers (> 500 kg / < 1 kg) as data-entry errors
      if (value > 500 || value < 1) {
        return { isAlert: true, reason: 'Unusual weight value — please verify entry' };
      }
      return { isAlert: false };
    }
    case 'exercise': {
      // Flag if > 600 minutes/day — likely data entry error
      if (value > 600) {
        return { isAlert: true, reason: 'Unusually high exercise duration — please verify entry' };
      }
      return { isAlert: false };
    }
    default:
      return { isAlert: false };
  }
}
