import {
  addGroup,
  addRule,
  createGroup,
  createRule,
  describeGroup,
  evaluateFilter,
  evaluateGroup,
  evaluateRule,
  groupFromSnapshot,
  isEmptyGroup,
  pruneEmptyGroups,
  removeNode,
  ruleCount,
  serializeGroupToShareUrl,
  deserializeShareUrl,
  toggleCombinator,
  updateRule,
} from '../engine';
import { type FilterField, type FilterGroup, type FilterRule } from '../types';
import { PATIENT_FILTER_FIELDS } from '../fields';

const fields: FilterField[] = PATIENT_FILTER_FIELDS;

const records = [
  {
    systemId: 'P-001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    sex: 'F',
    dateOfBirth: '1980-05-10',
    riskLevel: 'high',
    riskScore: 82,
    isActive: true,
    createdAt: '2025-01-01',
  },
  {
    systemId: 'P-002',
    firstName: 'Alan',
    lastName: 'Turing',
    sex: 'M',
    dateOfBirth: '1912-06-23',
    riskLevel: 'low',
    riskScore: 12,
    isActive: true,
    createdAt: '2024-11-15',
  },
  {
    systemId: 'P-003',
    firstName: 'Grace',
    lastName: 'Hopper',
    sex: 'F',
    dateOfBirth: '1906-12-09',
    riskLevel: 'critical',
    riskScore: 95,
    isActive: false,
    createdAt: '2025-03-02',
  },
];

function compile(group: FilterGroup): FilterGroup {
  return group;
}

describe('filter engine', () => {
  it('matches a simple equals rule', () => {
    const rule = createRule('sex', 'equals');
    rule.value = 'F';
    const matches = records.filter((record) => evaluateRule(record, rule, fields));
    expect(matches.map((r) => r.systemId)).toEqual(['P-001', 'P-003']);
  });

  it('matches contains on a string field (case-insensitive)', () => {
    const rule = createRule('lastName', 'contains');
    rule.value = 'HOPPER';
    expect(records.some((record) => evaluateRule(record, rule, fields))).toBe(true);
  });

  it('supports numeric range operators', () => {
    const rule = createRule('riskScore', 'gte');
    rule.value = 50;
    const matches = records.filter((record) => evaluateRule(record, rule, fields));
    expect(matches.map((r) => r.systemId)).toEqual(['P-001', 'P-003']);
  });

  it('supports between operator on numbers', () => {
    const rule = createRule('riskScore', 'between');
    rule.value = 10;
    rule.valueTo = 30;
    const matches = records.filter((record) => evaluateRule(record, rule, fields));
    expect(matches.map((r) => r.systemId)).toEqual(['P-002']);
  });

  it('evaluates AND groups as the intersection', () => {
    const group = createGroup('and');
    const sex = createRule('sex', 'equals');
    sex.value = 'F';
    const active = createRule('isActive', 'equals');
    active.value = true;
    const result = evaluateGroup(records[0], compile(addRule(addRule(group, sex), active)), fields);
    expect(result).toBe(true);
    expect(evaluateGroup(records[2], compile(addRule(addRule(group, sex), active)), fields)).toBe(
      false
    );
  });

  it('evaluates OR groups as the union', () => {
    const group = createGroup('or');
    const high = createRule('riskLevel', 'equals');
    high.value = 'high';
    const critical = createRule('riskLevel', 'equals');
    critical.value = 'critical';
    const g = compile(addRule(addRule(group, high), critical));
    expect(records.filter((r) => evaluateGroup(r, g, fields)).map((r) => r.systemId)).toEqual([
      'P-001',
      'P-003',
    ]);
  });

  it('supports complex nested Boolean logic', () => {
    const root = createGroup('and');
    const riskGroup = createGroup('or');
    const high = createRule('riskLevel', 'equals');
    high.value = 'high';
    const critical = createRule('riskLevel', 'equals');
    critical.value = 'critical';
    const riskOr = addRule(addRule(riskGroup, high), critical);

    const ageRule = createRule('riskScore', 'gte');
    ageRule.value = 80;
    const withAge = addRule(root, ageRule);
    const withGroup = addGroup(withAge, riskOr);

    const result = evaluateFilter(records, compile(withGroup), fields);
    expect(result.map((r) => r.systemId)).toEqual(['P-001', 'P-003']);
  });

  it('handles empty groups as match-all regardless of combinator', () => {
    expect(evaluateFilter(records, compile(createGroup('and')), fields)).toHaveLength(3);
    expect(evaluateFilter(records, compile(createGroup('or')), fields)).toHaveLength(3);
  });

  it('counts nested rules', () => {
    const root = createGroup('and');
    const nested = createGroup('or');
    const g = addGroup(
      addRule(root, createRule('sex', 'equals')),
      addRule(nested, createRule('sex', 'equals'))
    );
    expect(ruleCount(g)).toBe(2);
  });

  it('toggles group combinator', () => {
    expect(toggleCombinator(createGroup('and')).combinator).toBe('or');
  });

  it('updates a nested rule in place', () => {
    const root = createGroup('and');
    const nested = createGroup('or');
    const rule = createRule('sex', 'equals');
    const g = addGroup(addRule(root, rule), nested);
    const updated = updateRule(g, rule.id, { operator: 'notEquals' });
    let found: string | undefined;
    const walk = (node: FilterRule | FilterGroup): void => {
      if ('rules' in node) node.rules.forEach(walk);
      else if (node.id === rule.id) found = node.operator;
    };
    walk(updated);
    expect(found).toBe('notEquals');
  });

  it('removes a node and prunes empty groups', () => {
    const root = createGroup('and');
    const rule = createRule('sex', 'equals');
    const g = pruneEmptyGroups(removeNode(addRule(root, rule), rule.id));
    expect(isEmptyGroup(g)).toBe(true);
  });

  it('serializes and deserializes groups for sharing', () => {
    const root = createGroup('or');
    const rule = createRule('riskLevel', 'equals');
    rule.value = 'critical';
    const g = addRule(root, rule);
    const encoded = serializeGroupToShareUrl(g);
    const restored = groupFromSnapshot(deserializeShareUrl(encoded)!);
    expect(describeGroup(restored, fields)).toContain('Risk level');
    expect(evaluateFilter(records, restored, fields).map((r) => r.systemId)).toEqual(['P-003']);
  });
});
