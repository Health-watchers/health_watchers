'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
} from '@/components/ui';
import { downloadCsv } from '@/lib/utils';
import { statusBadgeVariant } from '@/lib/medications/labels';
import {
  buildPharmacyExport,
  pharmacyExportFilename,
  pharmacyExportToCsv,
} from '@/lib/medications/pharmacy';
import type { Medication, PatientSummary } from '@/lib/medications/types';

export interface PharmacyExportPanelProps {
  patient: PatientSummary;
  medications: readonly Medication[];
}

/**
 * Issue #1314 — medication export to pharmacy.
 * Shows exactly what will be handed to the dispensing system before the CSV is
 * generated, including the medications deliberately excluded from the export.
 */
export function PharmacyExportPanel({ patient, medications }: PharmacyExportPanelProps) {
  const [status, setStatus] = useState<string | null>(null);

  const rows = useMemo(() => buildPharmacyExport(patient, medications), [patient, medications]);
  const excluded = useMemo(
    () =>
      medications.filter(
        (medication) => medication.status !== 'active' && medication.status !== 'on_hold'
      ),
    [medications]
  );

  const handleExport = () => {
    if (rows.length === 0) {
      setStatus('Nothing to export — the patient has no active or on-hold medications.');
      return;
    }
    downloadCsv(pharmacyExportToCsv(rows), pharmacyExportFilename(patient));
    setStatus(`Exported ${rows.length} medication${rows.length === 1 ? '' : 's'} for ${patient.name}.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Pharmacy hand-off
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {patient.name} · {patient.mrn} · {rows.length} item{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={handleExport} disabled={rows.length === 0}>
          Export to pharmacy (CSV)
        </Button>
      </div>

      {status && (
        <p role="status" className="text-primary-600 dark:text-primary-400 text-sm">
          {status}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to export"
          description="Only active and on-hold medications are sent to the pharmacy."
        />
      ) : (
        <Table aria-label="Pharmacy export preview">
          <TableHead>
            <TableRow>
              <TableTh>Medication</TableTh>
              <TableTh>Dose</TableTh>
              <TableTh>Frequency</TableTh>
              <TableTh>Qty</TableTh>
              <TableTh>Refills left</TableTh>
              <TableTh>Status</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.medication}-${row.dose}`}>
                <TableTd>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {row.medication}
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {row.generic_name}
                  </span>
                </TableTd>
                <TableTd>{row.dose}</TableTd>
                <TableTd>
                  {row.frequency}
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {row.route}
                  </span>
                </TableTd>
                <TableTd>{row.quantity}</TableTd>
                <TableTd>{row.refills_remaining}</TableTd>
                <TableTd>
                  <Badge variant={statusBadgeVariant(row.status_key)}>{row.status}</Badge>
                </TableTd>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {excluded.length > 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Excluded from the export: {excluded.map((medication) => medication.drugName).join(', ')}.
        </p>
      )}
    </div>
  );
}
