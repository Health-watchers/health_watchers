import { type FilterField, type FilterGroup, type FilterRule } from './types';
import {
  evaluateFilter,
  serializeGroupToShareUrl,
  deserializeShareUrl,
  groupFromSnapshot,
} from './engine';

export interface ExportOptions {
  group: FilterGroup;
  name?: string;
}

export function toJson(options: ExportOptions): string {
  return JSON.stringify(
    {
      kind: 'health-watchers/filter',
      version: 1,
      name: options.name ?? 'Untitled filter',
      exportedAt: new Date().toISOString(),
      group: options.group,
    },
    null,
    2
  );
}

export function toShareUrl(options: ExportOptions): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/patients?filter=${serializeGroupToShareUrl(options.group)}`;
}

export function importFromJson(
  serialized: string,
  onError?: (message: string) => void
): FilterGroup | null {
  try {
    const raw = JSON.parse(serialized);
    if (raw && raw.kind === 'health-watchers/filter' && raw.group) {
      return raw.group as FilterGroup;
    }
    const envelope = deserializeShareUrl(serialized);
    if (envelope) return groupFromSnapshot(envelope);
    onError?.('Unrecognised filter payload');
    return null;
  } catch {
    onError?.('Invalid JSON – could not import filter');
    return null;
  }
}

export function importFromShareUrl(encoded: string): FilterGroup | null {
  const snapshot = deserializeShareUrl(encoded);
  return snapshot ? groupFromSnapshot(snapshot) : null;
}

export function toCsv(
  records: Array<Record<string, unknown>>,
  group: FilterGroup,
  fields: FilterField[]
): string {
  const matched = evaluateFilter(records, group, fields);
  const headers = [
    'systemId',
    'firstName',
    'lastName',
    'dateOfBirth',
    'sex',
    'contactNumber',
    'riskLevel',
  ];
  const rows = matched.map((record) =>
    headers.map((header) => {
      const value = record[header];
      return value == null ? '' : `"${String(value).replace(/"/g, '""')}"`;
    })
  );
  return [
    headers.map((header) => `"${header}"`).join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n');
}

export function activeRuleValues(
  group: FilterGroup,
  fieldId: string
): Array<string | number | boolean> {
  const values: Array<string | number | boolean> = [];
  const walk = (node: FilterGroup | FilterRule): void => {
    if ('rules' in node) {
      node.rules.forEach(walk);
      return;
    }
    if (node.fieldId === fieldId && node.value != null) values.push(node.value);
  };
  walk(group);
  return values;
}
