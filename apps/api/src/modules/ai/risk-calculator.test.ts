import { calculateRiskScore, scoreToLevel } from './risk-calculator';

describe('scoreToLevel', () => {
  it('returns low for score < 20', () => expect(scoreToLevel(0)).toBe('low'));
  it('returns low for score 19', () => expect(scoreToLevel(19)).toBe('low'));
  it('returns medium for score 20', () => expect(scoreToLevel(20)).toBe('medium'));
  it('returns medium for score 44', () => expect(scoreToLevel(44)).toBe('medium'));
  it('returns high for score 45', () => expect(scoreToLevel(45)).toBe('high'));
  it('returns high for score 69', () => expect(scoreToLevel(69)).toBe('high'));
  it('returns critical for score 70', () => expect(scoreToLevel(70)).toBe('critical'));
  it('returns critical for score 100', () => expect(scoreToLevel(100)).toBe('critical'));
});

describe('calculateRiskScore', () => {
  const base = {
    ageYears: 30,
    diagnoses: [],
    recentHospitalization: false,
    missedAppointments: 0,
    abnormalLabCount: 0,
    highBloodPressure: false,
    bmiOver30: false,
    smokingHistory: false,
  };

  it('returns score 0 and level low for healthy young patient', () => {
    const { score, level, factors } = calculateRiskScore(base);
    expect(score).toBe(0);
    expect(level).toBe('low');
    expect(factors).toHaveLength(0);
  });

  it('adds 10 points for age > 65', () => {
    const { score, factors } = calculateRiskScore({ ...base, ageYears: 70 });
    expect(score).toBe(10);
    expect(factors).toContain('Age > 65');
  });

  it('adds 15 points for diabetes diagnosis', () => {
    const { score, factors } = calculateRiskScore({ ...base, diagnoses: ['Type 2 Diabetes Mellitus'] });
    expect(score).toBe(15);
    expect(factors).toContain('Diabetes');
  });

  it('adds 15 points for hypertension diagnosis', () => {
    const { score, factors } = calculateRiskScore({ ...base, diagnoses: ['Essential Hypertension'] });
    expect(score).toBe(15);
    expect(factors).toContain('Hypertension');
  });

  it('adds 15 points for COPD diagnosis', () => {
    const { score, factors } = calculateRiskScore({ ...base, diagnoses: ['COPD exacerbation'] });
    expect(score).toBe(15);
    expect(factors).toContain('COPD');
  });

  it('does not double-count same chronic condition', () => {
    const { score } = calculateRiskScore({ ...base, diagnoses: ['Diabetes type 1', 'Diabetes type 2'] });
    expect(score).toBe(15);
  });

  it('adds 20 points for recent hospitalization', () => {
    const { score, factors } = calculateRiskScore({ ...base, recentHospitalization: true });
    expect(score).toBe(20);
    expect(factors).toContain('Recent hospitalization');
  });

  it('adds 5 points per missed appointment (capped at 20)', () => {
    const { score: s1 } = calculateRiskScore({ ...base, missedAppointments: 1 });
    expect(s1).toBe(5);
    const { score: s4 } = calculateRiskScore({ ...base, missedAppointments: 4 });
    expect(s4).toBe(20);
    const { score: s10 } = calculateRiskScore({ ...base, missedAppointments: 10 });
    expect(s10).toBe(20); // capped
  });

  it('adds 10 points per abnormal lab (capped at 30)', () => {
    const { score: s1 } = calculateRiskScore({ ...base, abnormalLabCount: 1 });
    expect(s1).toBe(10);
    const { score: s5 } = calculateRiskScore({ ...base, abnormalLabCount: 5 });
    expect(s5).toBe(30); // capped
  });

  it('adds 10 points for high blood pressure', () => {
    const { score, factors } = calculateRiskScore({ ...base, highBloodPressure: true });
    expect(score).toBe(10);
    expect(factors).toContain('High blood pressure readings');
  });

  it('adds 10 points for BMI > 30', () => {
    const { score, factors } = calculateRiskScore({ ...base, bmiOver30: true });
    expect(score).toBe(10);
    expect(factors).toContain('BMI > 30');
  });

  it('adds 5 points for smoking history', () => {
    const { score, factors } = calculateRiskScore({ ...base, smokingHistory: true });
    expect(score).toBe(5);
    expect(factors).toContain('Smoking history');
  });

  it('caps total score at 100', () => {
    const { score } = calculateRiskScore({
      ageYears: 70,
      diagnoses: ['Diabetes', 'Hypertension', 'COPD'],
      recentHospitalization: true,
      missedAppointments: 10,
      abnormalLabCount: 10,
      highBloodPressure: true,
      bmiOver30: true,
      smokingHistory: true,
    });
    expect(score).toBe(100);
  });

  it('returns critical level for high-risk patient', () => {
    const { level } = calculateRiskScore({
      ageYears: 70,
      diagnoses: ['Diabetes', 'Hypertension'],
      recentHospitalization: true,
      missedAppointments: 3,
      abnormalLabCount: 2,
      highBloodPressure: true,
      bmiOver30: false,
      smokingHistory: false,
    });
    // 10 + 15 + 15 + 20 + 15 + 20 + 10 = 105 → capped 100 → critical
    expect(level).toBe('critical');
  });

  it('lists all contributing factors', () => {
    const { factors } = calculateRiskScore({
      ...base,
      ageYears: 70,
      diagnoses: ['Diabetes'],
      recentHospitalization: true,
      smokingHistory: true,
    });
    expect(factors).toContain('Age > 65');
    expect(factors).toContain('Diabetes');
    expect(factors).toContain('Recent hospitalization');
    expect(factors).toContain('Smoking history');
  });
});
