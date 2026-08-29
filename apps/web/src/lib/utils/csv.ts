/**
 * CSV utility helpers.
 * Centralises the repeated "create Blob → object URL → click anchor → revoke"
 * pattern used for CSV template downloads and data exports.
 */

/**
 * Triggers a browser file-download for the given CSV content.
 *
 * @param content  - raw CSV string
 * @param filename - suggested download file name (should end with .csv)
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Converts an array of plain objects into a CSV string.
 * Uses the keys of the first row as headers.
 *
 * @param rows - array of objects with identical shapes
 */
export function objectsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    const str = val == null ? '' : String(val);
    // Wrap in quotes if the value contains a comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];

  return lines.join('\n');
}
