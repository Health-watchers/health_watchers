'use client';

import { useState } from 'react';
import { Badge, Button, Table, TableBody, TableHead, TableRow, TableTd, TableTh } from '@/components/ui';
import { downloadLabExport, labExportSummary } from '@/lib/lab-results/export';
import { formatAnalyteValue } from '@/lib/lab-results/referenceRanges';
import type { LabFinding, PatientSummary } from '@/lib/lab-results/types';

export interface LabResultsExportProps {
  patient: PatientSummary;
  /** The rows currently in view — the client passes the filtered set. */
  findings: readonly LabFinding[];
  totalCount: number;
}

const PREVIEW_LIMIT = 10;

/** Issue #1313 — result export. */
export function LabResultsExport({ patient, findings, totalCount }: LabResultsExportProps) {
  const [status, setStatus] = useState<string | null>(null);
  const summary = labExportSummary(findings);
  const preview = findings.slice(0, PREVIEW_LIMIT);

  const handleExport = () => {
    if (findings.length === 0) {
      setStatus('There is nothing to export with the current filters.');
      return;
    }
    const result = downloadLabExport(patient, findings);
    setStatus(
      `Exported ${result.rows} result${result.rows === 1 ? '' : 's'} (${result.abnormal} outside range, ${result.critical} critical).`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Export results
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {patient.name} · {patient.mrn} · {summary.rows} of {totalCount} result
            {totalCount === 1 ? '' : 's'} selected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={summary.abnormal > 0 ? 'warning' : 'success'}>
            {summary.abnormal} outside range
          </Badge>
          <Badge variant={summary.critical > 0 ? 'danger' : 'success'}>
            {summary.critical} critical
          </Badge>
          <Button onClick={handleExport} disabled={findings.length === 0}>
            Download CSV
          </Button>
        </div>
      </div>

      {status && (
        <p role="status" className="text-primary-600 dark:text-primary-400 text-sm">
          {status}
        </p>
      )}

      {findings.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No results match the current filters, so the export is empty.
        </p>
      ) : (
        <>
          <Table aria-label="Export preview">
            <TableHead>
              <TableRow>
                <TableTh>Collected</TableTh>
                <TableTh>Panel</TableTh>
                <TableTh>Test</TableTh>
                <TableTh>Result</TableTh>
                <TableTh>Reference</TableTh>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.map((finding) => (
                <TableRow key={`${finding.setId}-${finding.analyte}`}>
                  <TableTd>{finding.collectedAt.slice(0, 10)}</TableTd>
                  <TableTd>{finding.panel}</TableTd>
                  <TableTd>{finding.name}</TableTd>
                  <TableTd>
                    {formatAnalyteValue(finding.definition, finding.value)} {finding.unit}
                  </TableTd>
                  <TableTd>{finding.referenceRange}</TableTd>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {findings.length > PREVIEW_LIMIT && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Previewing the first {PREVIEW_LIMIT} of {findings.length} results. The CSV contains
              all {findings.length}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
