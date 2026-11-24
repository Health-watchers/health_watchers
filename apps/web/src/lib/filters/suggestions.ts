import { type FilterField, type FilterSuggestion } from './types';

export interface RecordLike {
  [key: string]: unknown;
}

function collectStringValues(records: RecordLike[], field: FilterField): string[] {
  const values = new Set<string>();
  records.forEach((record) => {
    const raw = resolve(record, field);
    if (Array.isArray(raw)) {
      raw.forEach((item) => {
        if (item != null && item !== '') values.add(String(item));
      });
      return;
    }
    if (raw != null && raw !== '') values.add(String(raw));
  });
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25);
}

function resolve(record: RecordLike, field: FilterField): unknown {
  const path = field.path ?? field.id;
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    return (current as RecordLike)[key];
  }, record);
}

function valueCounts(
  records: RecordLike[],
  field: FilterField
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  collectStringValues(records, field).forEach((value) => counts.set(value, 0));
  records.forEach((record) => {
    const raw = resolve(record, field);
    const values = Array.isArray(raw) ? raw : [raw];
    values.forEach((item) => {
      if (item == null || item === '') return;
      const key = String(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

const IDENTIFIER_FIELDS = new Set(['_id', 'systemId', 'id', 'clinicId']);

export function buildSuggestions(
  records: RecordLike[],
  fields: FilterField[],
  limit = 8
): FilterSuggestion[] {
  const suggestions: FilterSuggestion[] = [];

  const pushForField = (field: FilterField, maxValues: number) => {
    if (field.type !== 'string' && field.type !== 'number') return;
    if (IDENTIFIER_FIELDS.has(field.id)) return;
    const counts = valueCounts(records, field);
    if (counts.length === 0) return;
    const total = records.length || 1;
    let guessed = 0;
    counts.forEach(({ value, count }) => {
      if (guessed >= maxValues) return;
      const share = Math.round((count / total) * 100);
      if (share < 15) return;
      guessed += 1;
      suggestions.push({
        fieldId: field.id,
        operator: 'equals',
        value,
        label: `${field.label} = ${value}`,
        description: `${count} of ${records.length} records (${share}%)`,
      });
    });
  };

  const optionFields = fields.filter((field) => field.options && field.options.length > 0);
  const otherFields = fields.filter((field) => !(field.options && field.options.length > 0));
  optionFields.forEach((field) => pushForField(field, 3));

  if (fields.some((field) => field.id === 'riskLevel')) {
    suggestions.push({
      fieldId: 'riskLevel',
      operator: 'exists',
      value: true,
      label: 'Patients with a risk level assigned',
      description: 'Highlights records that have been risk-assessed.',
    });
  }

  otherFields.forEach((field) => pushForField(field, 1));

  return suggestions.slice(0, limit);
}

export function topOptions(records: RecordLike[], field: FilterField, limit = 12): string[] {
  return valueCounts(records, field)
    .slice(0, limit)
    .map((entry) => entry.value);
}
