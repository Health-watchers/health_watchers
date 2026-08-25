import { detectCriticalValues } from '../critical-value.service';

describe('detectCriticalValues', () => {
  it('returns not critical for an empty result list', () => {
    expect(detectCriticalValues([])).toEqual({ isCritical: false });
  });

  it('flags critically low potassium', () => {
    const result = detectCriticalValues([
      { parameter: 'Potassium', value: '2.0', unit: 'mmol/L', referenceRange: '3.5-5.0' },
    ]);
    expect(result.isCritical).toBe(true);
    expect(result.criticalReason).toMatch(/Potassium critically low/);
  });

  it('flags critically high glucose', () => {
    const result = detectCriticalValues([
      { parameter: 'Glucose', value: '600', unit: 'mg/dL', referenceRange: '70-100' },
    ]);
    expect(result.isCritical).toBe(true);
    expect(result.criticalReason).toMatch(/Glucose critically high/);
  });

  it('is case-insensitive when matching parameter names', () => {
    const result = detectCriticalValues([
      { parameter: 'potassium', value: '2.0', unit: 'mmol/L', referenceRange: '3.5-5.0' },
    ]);
    expect(result.isCritical).toBe(true);
  });

  it('returns not critical for values within normal range', () => {
    const result = detectCriticalValues([
      { parameter: 'Potassium', value: '4.0', unit: 'mmol/L', referenceRange: '3.5-5.0' },
    ]);
    expect(result.isCritical).toBe(false);
  });

  it('ignores parameters without a known threshold', () => {
    const result = detectCriticalValues([
      { parameter: 'Cholesterol', value: '999', unit: 'mg/dL', referenceRange: '<200' },
    ]);
    expect(result.isCritical).toBe(false);
  });

  it('ignores non-numeric values', () => {
    const result = detectCriticalValues([
      { parameter: 'Potassium', value: 'N/A', unit: 'mmol/L', referenceRange: '3.5-5.0' },
    ]);
    expect(result.isCritical).toBe(false);
  });

  it('returns the first critical value found and stops scanning', () => {
    const result = detectCriticalValues([
      { parameter: 'Potassium', value: '2.0', unit: 'mmol/L', referenceRange: '3.5-5.0' },
      { parameter: 'Glucose', value: '600', unit: 'mg/dL', referenceRange: '70-100' },
    ]);
    expect(result.criticalReason).toMatch(/Potassium/);
  });

  it('respects a one-sided threshold (no critical low for Creatinine)', () => {
    const result = detectCriticalValues([
      { parameter: 'Creatinine', value: '0.01', unit: 'mg/dL', referenceRange: '0.6-1.2' },
    ]);
    expect(result.isCritical).toBe(false);
  });
});
