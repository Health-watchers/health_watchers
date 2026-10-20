import { createGroup, createRule, addRule } from '../engine';
import { PATIENT_FILTER_FIELDS } from '../fields';
import { importFromJson, importFromShareUrl, toCsv, toJson, toShareUrl } from '../export';

const records = [
  {
    systemId: 'P-001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1980-05-10',
    sex: 'F',
    contactNumber: '111',
    riskLevel: 'high',
  },
  {
    systemId: 'P-002',
    firstName: 'Alan',
    lastName: 'Turing',
    dateOfBirth: '1912-06-23',
    sex: 'M',
    contactNumber: '222',
    riskLevel: 'low',
  },
];

function sampleGroup() {
  const rule = createRule('sex', 'equals');
  rule.value = 'F';
  return addRule(createGroup('and'), rule);
}

describe('filter export', () => {
  it('serializes the filter to versioned JSON', () => {
    const json = toJson({ group: sampleGroup(), name: 'Female' });
    const parsed = JSON.parse(json);
    expect(parsed.kind).toBe('health-watchers/filter');
    expect(parsed.version).toBe(1);
    expect(parsed.group.rules).toHaveLength(1);
  });

  it('round-trips a filter through JSON import', () => {
    const json = toJson({ group: sampleGroup(), name: 'Female' });
    const imported = importFromJson(json);
    expect(imported).not.toBeNull();
    expect(imported?.rules).toHaveLength(1);
  });

  it('rejects malformed JSON on import', () => {
    const onError = jest.fn();
    expect(importFromJson('{nope', onError)).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('produces a shareable URL and restores the filter from it', () => {
    const url = toShareUrl({ group: sampleGroup() });
    expect(url).toContain('filter=');
    const encoded = url.split('filter=')[1];
    const restored = importFromShareUrl(encoded);
    expect(restored?.combinator).toBe('and');
    expect(restored?.rules).toHaveLength(1);
  });

  it('exports only matching records to CSV', () => {
    const csv = toCsv(records, sampleGroup(), PATIENT_FILTER_FIELDS);
    expect(csv).toContain('"P-001"');
    expect(csv).not.toContain('"P-002"');
  });

  it('exports a header-only CSV when nothing matches', () => {
    const rule = createRule('sex', 'equals');
    rule.value = 'X';
    const group = addRule(createGroup('and'), rule);
    const csv = toCsv(records, group, PATIENT_FILTER_FIELDS);
    expect(csv.split('\n')).toHaveLength(1);
  });
});
