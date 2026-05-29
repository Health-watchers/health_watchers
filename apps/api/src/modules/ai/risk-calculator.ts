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
  /** Each factor name mapped to its point contribution (0–100 scale) */
  factorWeights: Record<string, number>;
}

const CHRONIC_KEYWORDS = ['diabetes', 'hypertension', 'copd', 'chronic obstructive'];

export function calculateRiskScore(input: RiskInput): RiskResult {
  let score = 0;
  const factors: string[] = [];
  const factorWeights: Record<string, number> = {};

  if (input.ageYears > 65) {
    score += 10;
    factors.push('Age > 65');
    factorWeights['Age > 65'] = 10;
  }

  const chronicMatches = new Set<string>();
  for (const d of input.diagnoses) {
    const lower = d.toLowerCase();
    if (lower.includes('diabetes') && !chronicMatches.has('diabetes')) {
      score += 15; factors.push('Diabetes'); factorWeights['Diabetes'] = 15; chronicMatches.add('diabetes');
    }
    if ((lower.includes('hypertension') || lower.includes('high blood pressure')) && !chronicMatches.has('hypertension')) {
      score += 15; factors.push('Hypertension'); factorWeights['Hypertension'] = 15; chronicMatches.add('hypertension');
    }
    if ((lower.includes('copd') || lower.includes('chronic obstructive')) && !chronicMatches.has('copd')) {
      score += 15; factors.push('COPD'); factorWeights['COPD'] = 15; chronicMatches.add('copd');
    }
  }

  if (input.recentHospitalization) {
    score += 20;
    factors.push('Recent hospitalization');
    factorWeights['Recent hospitalization'] = 20;
  }

  if (input.missedAppointments > 0) {
    const pts = Math.min(input.missedAppointments * 5, 20);
    score += pts;
    const label = `${input.missedAppointments} missed appointment(s)`;
    factors.push(label);
    factorWeights[label] = pts;
  }

  if (input.abnormalLabCount > 0) {
    const pts = Math.min(input.abnormalLabCount * 10, 30);
    score += pts;
    const label = `${input.abnormalLabCount} abnormal lab result(s)`;
    factors.push(label);
    factorWeights[label] = pts;
  }

  if (input.highBloodPressure) {
    score += 10;
    factors.push('High blood pressure readings');
    factorWeights['High blood pressure readings'] = 10;
  }

  if (input.bmiOver30) {
    score += 10;
    factors.push('BMI > 30');
    factorWeights['BMI > 30'] = 10;
  }

  if (input.smokingHistory) {
    score += 5;
    factors.push('Smoking history');
    factorWeights['Smoking history'] = 5;
  }

  const capped = Math.min(score, 100);
  const level = scoreToLevel(capped);
  return { score: capped, level, factors, factorWeights };
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

export { CHRONIC_KEYWORDS };
