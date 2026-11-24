import { buildSuggestions, topOptions } from '../suggestions';
import { PATIENT_FILTER_FIELDS } from '../fields';
import { type FilterField } from '../types';

const records = [
  { systemId: 'P-001', sex: 'F', riskLevel: 'high', city: 'Lagos' },
  { systemId: 'P-002', sex: 'F', riskLevel: 'low', city: 'Lagos' },
  { systemId: 'P-003', sex: 'M', riskLevel: 'high', city: 'Abuja' },
  { systemId: 'P-004', sex: 'F', riskLevel: 'critical', city: 'Lagos' },
];

describe('filter suggestions', () => {
  it('derives suggestions from the predominant values in the data', () => {
    const suggestions = buildSuggestions(records, PATIENT_FILTER_FIELDS, 20);
    expect(suggestions.some((s) => s.fieldId === 'sex' && s.value === 'F')).toBe(true);
    expect(suggestions.some((s) => s.fieldId === 'riskLevel' && s.value === 'high')).toBe(true);
  });

  it('generates a risk-level suggestion when the field is present', () => {
    const suggestions = buildSuggestions(records, PATIENT_FILTER_FIELDS);
    const risk = suggestions.find((s) => s.fieldId === 'riskLevel' && s.operator === 'exists');
    expect(risk).toBeDefined();
  });

  it('returns an empty array for empty data', () => {
    expect(buildSuggestions([], PATIENT_FILTER_FIELDS)).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const suggestions = buildSuggestions(records, PATIENT_FILTER_FIELDS, 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('ranks options by frequency', () => {
    const cityField: FilterField = { id: 'city', label: 'City', type: 'string' };
    const top = topOptions(records, cityField, 5);
    expect(top[0]).toBe('Lagos');
  });
});
