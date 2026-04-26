import type { RiskLevel } from '../patients/models/patient.model';

export interface RiskInput {
  ageYears: number;
  diagnoses: string[];          // ICD-10 descriptions / codes
  recentHospitalization: boolean;
  missedAppointments: number;
  abnormalLabCount: number;
  highBloodPressure: boolean;
  bmiOver30: boolean;
  smokingHistory: boolean;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: string[];
}

const CHRONIC_KEYWORDS = ['diabetes', 'hypertension', 'copd', 'chronic obstructive'];

export function calculateRiskScore(input: RiskInput): RiskResult {
  let score = 0;
  const factors: string[] = [];

  if (input.ageYears > 65) {
    score += 10;
    factors.push('Age > 65');
  }

  const chronicMatches = new Set<string>();
  for (const d of input.diagnoses) {
    const lower = d.toLowerCase();
    if (lower.includes('diabetes') && !chronicMatches.has('diabetes')) {
      score += 15; factors.push('Diabetes'); chronicMatches.add('diabetes');
    }
    if ((lower.includes('hypertension') || lower.includes('high blood pressure')) && !chronicMatches.has('hypertension')) {
      score += 15; factors.push('Hypertension'); chronicMatches.add('hypertension');
    }
    if ((lower.includes('copd') || lower.includes('chronic obstructive')) && !chronicMatches.has('copd')) {
      score += 15; factors.push('COPD'); chronicMatches.add('copd');
    }
  }

  if (input.recentHospitalization) {
    score += 20;
    factors.push('Recent hospitalization');
  }

  if (input.missedAppointments > 0) {
    const pts = Math.min(input.missedAppointments * 5, 20);
    score += pts;
    factors.push(`${input.missedAppointments} missed appointment(s)`);
  }

  if (input.abnormalLabCount > 0) {
    const pts = Math.min(input.abnormalLabCount * 10, 30);
    score += pts;
    factors.push(`${input.abnormalLabCount} abnormal lab result(s)`);
  }

  if (input.highBloodPressure) {
    score += 10;
    factors.push('High blood pressure readings');
  }

  if (input.bmiOver30) {
    score += 10;
    factors.push('BMI > 30');
  }

  if (input.smokingHistory) {
    score += 5;
    factors.push('Smoking history');
  }

  const capped = Math.min(score, 100);
  const level = scoreToLevel(capped);
  return { score: capped, level, factors };
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

export { CHRONIC_KEYWORDS };
