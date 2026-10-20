'use client';

import { useMemo, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { downloadCsv } from '@/lib/utils';

export interface ImportError {
  row: number;
  field: string;
  error: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
}

export interface ParsedCsv {
  delimiter: ',' | ';';
  headers: string[];
  rows: string[][];
}

export type PatientField =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'sex'
  | 'contactNumber'
  | 'address';

export const PATIENT_FIELDS: { key: PatientField; label: string; required: boolean }[] = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'dateOfBirth', label: 'Date of birth', required: true },
  { key: 'sex', label: 'Sex', required: false },
  { key: 'contactNumber', label: 'Contact number', required: false },
  { key: 'address', label: 'Address', required: false },
];

export type ColumnMapping = Partial<Record<PatientField, number>>;

export interface RowValidation {
  row: number;
  values: Partial<Record<PatientField, string>>;
  errors: string[];
  duplicate: boolean;
}

export interface ValidationSummary {
  rows: RowValidation[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

const CSV_TEMPLATE =
  'firstName,lastName,dateOfBirth,sex,contactNumber,address\nJohn,Doe,1990-01-15,M,+2348012345678,"123 Main St, Lagos"';

const PREVIEW_ROW_COUNT = 5;

/**
 * Split a single CSV line into fields, honouring double-quoted values
 * (including escaped quotes `""` and delimiters inside quotes).
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Detect the delimiter by comparing counts in the header line. */
export function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/** Parse raw CSV text into headers and rows. Supports comma and semicolon delimiters. */
export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { delimiter: ',', headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));
  return { delimiter, headers, rows };
}

/** Guess a mapping from CSV headers to patient fields based on header names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  for (const field of PATIENT_FIELDS) {
    const target = field.key.toLowerCase();
    const index = normalizedHeaders.findIndex(
      (h) => h === target || h.includes(target) || target.includes(h),
    );
    if (index !== -1 && !Object.values(mapping).includes(index)) {
      mapping[field.key] = index;
    }
  }
  return mapping;
}

/** Validate mapped rows: required fields, basic formats, and duplicates. */
export function validateRows(parsed: ParsedCsv, mapping: ColumnMapping): ValidationSummary {
  const seen = new Set<string>();
  const rows: RowValidation[] = parsed.rows.map((raw, i) => {
    const values: Partial<Record<PatientField, string>> = {};
    for (const field of PATIENT_FIELDS) {
      const col = mapping[field.key];
      if (col !== undefined) {
        values[field.key] = (raw[col] ?? '').trim();
      }
    }

    const errors: string[] = [];
    for (const field of PATIENT_FIELDS) {
      if (field.required && !values[field.key]) {
        errors.push(`${field.label} is required`);
      }
    }

    const dob = values.dateOfBirth;
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errors.push('Date of birth must be in YYYY-MM-DD format');
    }

    const key = [
      (values.firstName ?? '').toLowerCase(),
      (values.lastName ?? '').toLowerCase(),
      values.dateOfBirth ?? '',
    ].join('|');
    const duplicate = seen.has(key);
    seen.add(key);

    return { row: i + 2, values, errors, duplicate };
  });

  return {
    rows,
    validCount: rows.filter((r) => r.errors.length === 0 && !r.duplicate).length,
    invalidCount: rows.filter((r) => r.errors.length > 0).length,
    duplicateCount: rows.filter((r) => r.duplicate).length,
  };
}

export default function PatientImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'mapping' | 'uploading' | 'done' | 'error'>('idle');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);

  const validation = useMemo(
    () => (parsed ? validateRows(parsed, mapping) : null),
    [parsed, mapping],
  );

  const downloadTemplate = () => {
    downloadCsv(CSV_TEMPLATE, 'patients-template.csv');
  };

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setErrorMsg('');
    setProgress(0);

    try {
      const text = await file.text();
      const csv = parseCsv(text);
      if (csv.headers.length === 0) {
        setErrorMsg('The selected file is empty');
        setStatus('error');
        return;
      }
      setParsed(csv);
      setMapping(guessMapping(csv.headers));
      setStatus('mapping');
    } catch {
      setErrorMsg('Could not read the selected file');
      setStatus('error');
    } finally {
      resetInput();
    }
  };

  const handleMappingChange = (field: PatientField, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === '') {
        delete next[field];
      } else {
        next[field] = Number(value);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!parsed || !validation) return;

    setStatus('uploading');
    setErrorMsg('');
    setProgress(0);

    const formData = new FormData();
    formData.append('file', new Blob([JSON.stringify({ mapping, rows: parsed.rows })]), 'rows.json');

    // Simulated progress while the request is in flight.
    const timer = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 10 : p));
    }, 150);

    try {
      const res = await fetch(`${API_URL}/api/v1/patients/import`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || 'Import failed');
        setStatus('error');
      } else {
        setResult(json.data);
        setProgress(100);
        setStatus('done');
      }
    } catch {
      setErrorMsg('Network error — please try again');
      setStatus('error');
    } finally {
      clearInterval(timer);
    }
  };

  const cancelMapping = () => {
    setParsed(null);
    setMapping({});
    setStatus('idle');
  };

  const previewRows = parsed ? parsed.rows.slice(0, PREVIEW_ROW_COUNT) : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Bulk CSV Import</h2>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Download Template
        </button>

        <label className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {status === 'uploading' ? 'Uploading…' : 'Import CSV'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={status === 'uploading'}
            onChange={handleFileChange}
            aria-label="Upload CSV file"
          />
        </label>
      </div>

      {status === 'mapping' && parsed && validation && (
        <div className="mt-4 space-y-4" role="region" aria-label="Column mapping">
          <p className="text-sm text-gray-600">
            Detected <strong>{parsed.delimiter === ';' ? 'semicolon' : 'comma'}</strong> delimiter
            with {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'}. Map each patient
            field to a CSV column.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {PATIENT_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="text-red-600"> *</span>}
                </span>
                <select
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  aria-label={`Map ${field.label}`}
                >
                  <option value="">— Not mapped —</option>
                  {parsed.headers.map((header, i) => (
                    <option key={i} value={i}>
                      {header || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">
              Preview (first {Math.min(PREVIEW_ROW_COUNT, parsed.rows.length)} rows)
            </h3>
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {parsed.headers.map((header, i) => (
                      <th key={i} className="px-2 py-1 text-left font-medium text-gray-600">
                        {header || `Column ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, r) => (
                    <tr key={r} className="border-t border-gray-100">
                      {parsed.headers.map((_, c) => (
                        <td key={c} className="px-2 py-1 text-gray-700">
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-green-700">
              Valid: <strong>{validation.validCount}</strong>
            </span>
            <span className="text-red-700">
              Invalid: <strong>{validation.invalidCount}</strong>
            </span>
            <span className="text-yellow-700">
              Duplicates: <strong>{validation.duplicateCount}</strong>
            </span>
          </div>

          {validation.invalidCount > 0 && (
            <details>
              <summary className="cursor-pointer text-red-600 hover:underline">
                Show {validation.invalidCount} row error
                {validation.invalidCount > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-xs">
                {validation.rows
                  .filter((r) => r.errors.length > 0)
                  .map((r) => (
                    <li key={r.row} className="py-0.5">
                      Row {r.row}: {r.errors.join('; ')}
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={validation.validCount === 0}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import {validation.validCount} row{validation.validCount === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={cancelMapping}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === 'uploading' && (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="mb-1 text-sm text-gray-500">Processing import, please wait…</p>
          <div
            className="h-2 w-full overflow-hidden rounded bg-gray-200"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}

      {status === 'done' && result && (
        <div className="mt-4 space-y-2 text-sm" role="status" aria-live="polite">
          <div className="flex gap-4">
            <span className="text-gray-600">
              Total: <strong>{result.total}</strong>
            </span>
            <span className="text-green-700">
              Imported: <strong>{result.imported}</strong>
            </span>
            <span className="text-yellow-700">
              Skipped: <strong>{result.skipped}</strong>
            </span>
            <span className="text-red-700">
              Errors: <strong>{result.errors.length}</strong>
            </span>
          </div>

          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600 hover:underline">
                Show {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-xs">
                {result.errors.map((e, i) => (
                  <li key={i} className="py-0.5">
                    Row {e.row} — <span className="font-medium">{e.field}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
