/**
 * #1251 — Report export helpers.
 *
 * Query results come back as `{ key: {...}, value: number }` rows. `rowsToCsv`
 * flattens the group key into columns so the output is a normal wide table.
 */

export interface ResultRow {
  key: Record<string, unknown>;
  value: number;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: ResultRow[]): string {
  if (rows.length === 0) return 'value\n';

  const keyColumns = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r.key ?? {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const header = [...keyColumns, 'value'].map(csvCell).join(',');
  const lines = rows.map((r) =>
    [...keyColumns.map((c) => csvCell(r.key?.[c])), csvCell(r.value)].join(',')
  );

  return [header, ...lines].join('\n') + '\n';
}
