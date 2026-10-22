import {
  type FilterCombinator,
  type FilterField,
  type FilterGroup,
  type FilterOperator,
  type FilterRule,
  type FilterSnapshot,
  FILTER_SERIALIZATION_VERSION,
} from './types';

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'equals',
  notEquals: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  exists: 'is set',
  isEmpty: 'is empty',
};

export function operatorLabel(operator: FilterOperator): string {
  return OPERATOR_LABELS[operator];
}

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createGroup(combinator: FilterCombinator = 'and'): FilterGroup {
  return { id: newId('group'), combinator, rules: [] };
}

export function createRule(fieldId: string, operator: FilterOperator = 'equals'): FilterRule {
  return { id: newId('rule'), fieldId, operator };
}

export function asGroup(node: FilterRule | FilterGroup): FilterGroup {
  return 'rules' in node ? node : createGroup('and');
}

export function addRule(group: FilterGroup, rule: FilterRule): FilterGroup {
  return { ...group, rules: [...group.rules, rule] };
}

export function addGroup(node: FilterGroup, group: FilterGroup): FilterGroup {
  return { ...node, rules: [...node.rules, group] };
}

export function updateRule(
  group: FilterGroup,
  ruleId: string,
  patch: Partial<FilterRule>
): FilterGroup {
  return {
    ...group,
    rules: group.rules.map((node) => {
      if (!('rules' in node) && node.id === ruleId) return { ...node, ...patch };
      if ('rules' in node) return updateRule(node, ruleId, patch);
      return node;
    }),
  };
}

export function removeNode(group: FilterGroup, nodeId: string): FilterGroup {
  return {
    ...group,
    rules: group.rules.filter((node) => node.id !== nodeId),
  };
}

export function toggleCombinator(group: FilterGroup): FilterGroup {
  return { ...group, combinator: group.combinator === 'and' ? 'or' : 'and' };
}

export function ruleCount(group: FilterGroup): number {
  return group.rules.reduce((total, node) => {
    if ('rules' in node) return total + ruleCount(node);
    return total + 1;
  }, 0);
}

function resolveValue(record: Record<string, unknown>, field: FilterField): unknown {
  const path = field.path ?? field.id;
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      return current.map((item) =>
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined
      );
    }
    return (current as Record<string, unknown>)[key];
  }, record);
}

function compareNumber(
  actual: number,
  operator: FilterOperator,
  value: number,
  valueTo?: number
): boolean {
  switch (operator) {
    case 'gt':
      return actual > value;
    case 'gte':
      return actual >= value;
    case 'lt':
      return actual < value;
    case 'lte':
      return actual <= value;
    case 'between':
      return actual >= value && actual <= (valueTo ?? value);
    case 'equals':
      return actual === value;
    case 'notEquals':
      return actual !== value;
    default:
      return false;
  }
}

function compareString(actual: string, operator: FilterOperator, value: string): boolean {
  const haystack = actual.toLocaleLowerCase();
  const needle = String(value).toLocaleLowerCase();
  switch (operator) {
    case 'equals':
      return haystack === needle;
    case 'notEquals':
      return haystack !== needle;
    case 'contains':
      return haystack.includes(needle);
    case 'notContains':
      return !haystack.includes(needle);
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'endsWith':
      return haystack.endsWith(needle);
    case 'gt':
      return actual.localeCompare(String(value)) > 0;
    case 'gte':
      return actual.localeCompare(String(value)) >= 0;
    case 'lt':
      return actual.localeCompare(String(value)) < 0;
    case 'lte':
      return actual.localeCompare(String(value)) <= 0;
    default:
      return false;
  }
}

function typedActual(raw: unknown, field: FilterField): string | number | boolean {
  if (field.type === 'number') {
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  if (field.type === 'boolean') {
    return Boolean(raw);
  }
  if (field.type === 'date') {
    const date = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  return raw == null ? '' : String(raw);
}

export function evaluateRule(
  record: Record<string, unknown>,
  rule: FilterRule,
  fields: FilterField[]
): boolean {
  const field = fields.find((candidate) => candidate.id === rule.fieldId);
  if (!field) return false;
  const raw = resolveValue(record, field);

  if (rule.operator === 'exists') {
    return raw !== undefined && raw !== null && raw !== '';
  }
  if (rule.operator === 'isEmpty') {
    return raw === undefined || raw === null || raw === '';
  }

  if (Array.isArray(raw)) {
    const normalized = raw.map((item) =>
      typeof item === 'string' ? item : item == null ? '' : String(item)
    );
    const needle = String(rule.value ?? '');
    switch (rule.operator) {
      case 'contains':
        return normalized.some((item) =>
          item.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
        );
      case 'notContains':
        return !normalized.some((item) =>
          item.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
        );
      case 'equals':
        return normalized.some((item) => item.toLocaleLowerCase() === needle.toLocaleLowerCase());
      case 'notEquals':
        return !normalized.some((item) => item.toLocaleLowerCase() === needle.toLocaleLowerCase());
      default:
        return false;
    }
  }

  const actual = typedActual(raw, field);
  if (
    raw == null ||
    raw === '' ||
    actual === '' ||
    (typeof actual === 'number' && Number.isNaN(actual))
  ) {
    return false;
  }

  switch (field.type) {
    case 'number':
      return compareNumber(
        actual as number,
        rule.operator,
        Number(rule.value ?? 0),
        Number(rule.valueTo)
      );
    case 'boolean':
      if (rule.operator === 'equals') return actual === rule.value;
      if (rule.operator === 'notEquals') return actual !== rule.value;
      return false;
    case 'date':
      return compareString(
        actual as string,
        rule.operator,
        typeof rule.value === 'string' ? rule.value : ''
      );
    default:
      return compareString(actual as string, rule.operator, String(rule.value ?? ''));
  }
}

export function evaluateGroup(
  record: Record<string, unknown>,
  group: FilterGroup,
  fields: FilterField[]
): boolean {
  const results = group.rules.map((node) =>
    'rules' in node ? evaluateGroup(record, node, fields) : evaluateRule(record, node, fields)
  );
  if (results.length === 0) return true;
  return group.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateFilter(
  records: Array<Record<string, unknown>>,
  group: FilterGroup | null,
  fields: FilterField[]
): Array<Record<string, unknown>> {
  if (!group || ruleCount(group) === 0) return records;
  return records.filter((record) => evaluateGroup(record, group, fields));
}

export function serializeSnapshot(group: FilterGroup): string {
  const snapshot: FilterSnapshot = {
    version: FILTER_SERIALIZATION_VERSION,
    savedAt: new Date().toISOString(),
    group,
  };
  return JSON.stringify(snapshot);
}

export function serializeGroupToShareUrl(group: FilterGroup): string {
  return encodeURIComponent(serializeSnapshot(group));
}

export function deserializeSnapshot(serialized: string): FilterSnapshot | null {
  try {
    const raw = JSON.parse(serialized) as FilterSnapshot;
    if (!raw || raw.version !== FILTER_SERIALIZATION_VERSION || !raw.group) return null;
    return raw;
  } catch {
    return null;
  }
}

export function deserializeShareUrl(encoded: string): FilterSnapshot | null {
  try {
    return deserializeSnapshot(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

export function groupFromSnapshot(snapshot: FilterSnapshot): FilterGroup {
  return snapshot.group;
}

export function ruleSummary(rule: FilterRule, fields: FilterField[]): string {
  const field = fields.find((candidate) => candidate.id === rule.fieldId);
  const fieldLabel = field ? field.label : rule.fieldId;
  if (rule.operator === 'exists') return `${fieldLabel} is set`;
  if (rule.operator === 'isEmpty') return `${fieldLabel} is empty`;
  if (rule.operator === 'between') {
    return `${fieldLabel} between ${String(rule.value)} and ${String(rule.valueTo)}`;
  }
  return `${fieldLabel} ${operatorLabel(rule.operator)} ${typeof rule.value === 'boolean' ? rule.value : `"${String(rule.value)}"`}`;
}

export function describeGroup(group: FilterGroup, fields: FilterField[]): string {
  const describeNode = (node: FilterRule | FilterGroup): string => {
    if ('rules' in node) {
      if (node.rules.length === 0) return '';
      return `(${node.rules.map(describeNode).filter(Boolean).join(` ${node.combinator.toUpperCase()} `)})`;
    }
    return ruleSummary(node, fields);
  };
  return describeNode(group);
}

export function pruneEmptyGroups(group: FilterGroup): FilterGroup {
  const rules = group.rules
    .filter((node) => {
      if ('rules' in node) {
        const pruned = pruneEmptyGroups(node);
        return pruned.rules.length > 0;
      }
      return Boolean(node.fieldId);
    })
    .map((node) => {
      if ('rules' in node) return pruneEmptyGroups(node);
      return node;
    });
  return { ...group, rules };
}

export function isEmptyGroup(group: FilterGroup): boolean {
  return pruneEmptyGroups(group).rules.length === 0;
}
