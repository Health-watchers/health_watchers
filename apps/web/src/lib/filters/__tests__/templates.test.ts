import { evaluateFilter, ruleCount, describeGroup } from '../engine';
import { PRESET_FILTER_TEMPLATES, applyTemplate } from '../templates';
import { PATIENT_FILTER_FIELDS } from '../fields';

const records = [
  {
    systemId: 'P-001',
    riskLevel: 'high',
    dateOfBirth: '1980-05-10',
    sex: 'F',
    riskScore: 82,
    isActive: true,
    createdAt: '2025-01-01',
  },
  {
    systemId: 'P-002',
    riskLevel: 'low',
    dateOfBirth: '1912-06-23',
    sex: 'M',
    riskScore: 12,
    isActive: true,
    createdAt: '2024-11-15',
  },
  {
    systemId: 'P-003',
    riskLevel: 'critical',
    dateOfBirth: '1906-12-09',
    sex: 'F',
    riskScore: 95,
    isActive: false,
    createdAt: '2025-03-02',
  },
];

describe('filter templates', () => {
  it('exposes a high-risk template that matches high or critical risk', () => {
    const template = PRESET_FILTER_TEMPLATES.find((t) => t.id === 'high-risk');
    expect(template).toBeDefined();
    const applied = applyTemplate(template!);
    const matched = evaluateFilter(records, applied, PATIENT_FILTER_FIELDS).map((r) => r.systemId);
    expect(matched).toEqual(['P-001', 'P-003']);
  });

  it('active template matches only active patients', () => {
    const template = PRESET_FILTER_TEMPLATES.find((t) => t.id === 'active');
    const applied = applyTemplate(template!);
    const matched = evaluateFilter(records, applied, PATIENT_FILTER_FIELDS).map((r) => r.systemId);
    expect(matched).toEqual(['P-001', 'P-002']);
  });

  it('over-40 template matches older patients', () => {
    const template = PRESET_FILTER_TEMPLATES.find((t) => t.id === 'over-40');
    const applied = applyTemplate(template!);
    const matched = evaluateFilter(records, applied, PATIENT_FILTER_FIELDS).map((r) => r.systemId);
    expect(matched).toEqual(['P-002', 'P-003']);
  });

  it('applied templates are deep copies (mutating one never affects the template)', () => {
    const template = PRESET_FILTER_TEMPLATES.find((t) => t.id === 'high-risk')!;
    const first = applyTemplate(template);
    const second = applyTemplate(template);
    first.rules.pop();
    expect(second.rules).toHaveLength(2);
  });

  it('all templates describe cleanly for the UI', () => {
    PRESET_FILTER_TEMPLATES.forEach((template) => {
      expect(ruleCount(template.group)).toBeGreaterThan(0);
      expect(describeGroup(template.group, PATIENT_FILTER_FIELDS).length).toBeGreaterThan(0);
    });
  });
});
