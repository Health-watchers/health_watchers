export type AgingOverrideStatus = 'in_dispute' | 'payment_plan' | 'written_off' | null;

export interface AgingEntry {
  encounterId: string;
  patientId: string;
  patientName?: string;
  serviceDate: Date;
  daysUnbilled: number;
  amount: number;
  overrideStatus: AgingOverrideStatus;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  encounters: AgingEntry[];
}

export interface AgingBucketSummary {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  totalAmount: number;
}

export interface AgingSummary {
  asOf: Date;
  buckets: AgingBucketSummary[];
  totalCount: number;
  totalAmount: number;
}

export type ReminderStage = 30 | 60 | 90;

export interface AgingInputEntry {
  encounterId: string;
  patientId: string;
  patientName?: string;
  serviceDate: Date;
  amount: number;
  overrideStatus?: AgingOverrideStatus;
}

const BUCKETS: Omit<AgingBucket, 'encounters'>[] = [
  { label: '0–30 days', minDays: 0, maxDays: 30 },
  { label: '31–60 days', minDays: 31, maxDays: 60 },
  { label: '61–90 days', minDays: 61, maxDays: 90 },
  { label: '91–120 days', minDays: 91, maxDays: 120 },
  { label: '120+ days', minDays: 121, maxDays: null },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function buildAgingReport(
  entries: AgingInputEntry[],
  asOf: Date = new Date()
): AgingBucket[] {
  const buckets: AgingBucket[] = BUCKETS.map((b) => ({ ...b, encounters: [] }));

  for (const entry of entries) {
    const days = daysBetween(entry.serviceDate, asOf);
    const bucket = buckets.find(
      (b) => days >= b.minDays && (b.maxDays === null || days <= b.maxDays)
    );
    if (bucket) {
      bucket.encounters.push({
        encounterId: entry.encounterId,
        patientId: entry.patientId,
        patientName: entry.patientName,
        serviceDate: entry.serviceDate,
        daysUnbilled: days,
        amount: entry.amount,
        overrideStatus: entry.overrideStatus ?? null,
      });
    }
  }

  return buckets;
}

export function buildAgingSummary(
  buckets: AgingBucket[],
  asOf: Date = new Date()
): AgingSummary {
  const summaries: AgingBucketSummary[] = buckets.map((b) => ({
    label: b.label,
    minDays: b.minDays,
    maxDays: b.maxDays,
    count: b.encounters.length,
    totalAmount: b.encounters.reduce((sum, e) => sum + e.amount, 0),
  }));

  return {
    asOf,
    buckets: summaries,
    totalCount: summaries.reduce((sum, b) => sum + b.count, 0),
    totalAmount: summaries.reduce((sum, b) => sum + b.totalAmount, 0),
  };
}

/**
 * Determines which reminder stage (30/60/90 days) an entry is due for.
 * Returns null if the entry is not eligible (override status set, not yet
 * 30 days overdue, or already past the final stage without a matching stage).
 */
export function getReminderStage(entry: AgingEntry): ReminderStage | null {
  if (entry.overrideStatus !== null) {
    return null;
  }
  const days = entry.daysUnbilled;
  if (days >= 90) return 90;
  if (days >= 60) return 60;
  if (days >= 30) return 30;
  return null;
}

/**
 * Returns all entries eligible for a reminder at the given stage.
 */
export function getEntriesDueForReminder(
  buckets: AgingBucket[],
  stage: ReminderStage
): AgingEntry[] {
  const result: AgingEntry[] = [];
  for (const bucket of buckets) {
    for (const entry of bucket.encounters) {
      if (getReminderStage(entry) === stage) {
        result.push(entry);
      }
    }
  }
  return result;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportAgingReportToCsv(buckets: AgingBucket[]): string {
  const header = [
    'Bucket',
    'Encounter ID',
    'Patient ID',
    'Patient Name',
    'Service Date',
    'Days Unbilled',
    'Amount',
    'Override Status',
  ];
  const rows: string[] = [header.join(',')];

  for (const bucket of buckets) {
    for (const entry of bucket.encounters) {
      rows.push(
        [
          escapeCsvField(bucket.label),
          escapeCsvField(entry.encounterId),
          escapeCsvField(entry.patientId),
          escapeCsvField(entry.patientName ?? ''),
          escapeCsvField(entry.serviceDate.toISOString().slice(0, 10)),
          String(entry.daysUnbilled),
          entry.amount.toFixed(2),
          escapeCsvField(entry.overrideStatus ?? ''),
        ].join(',')
      );
    }
  }

  return rows.join('\n');
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Produces a minimal, dependency-free PDF document (PDF 1.4) representing the
 * aging report. Each bucket is rendered as a section with its entries listed.
 */
export function exportAgingReportToPdf(
  buckets: AgingBucket[],
  asOf: Date = new Date()
): Buffer {
  const lines: string[] = [];
  lines.push(`Billing Aging Report - as of ${asOf.toISOString().slice(0, 10)}`);
  lines.push('');

  for (const bucket of buckets) {
    const total = bucket.encounters.reduce((sum, e) => sum + e.amount, 0);
    lines.push(
      `${bucket.label} - ${bucket.encounters.length} item(s), total ${total.toFixed(2)}`
    );
    for (const entry of bucket.encounters) {
      const name = entry.patientName ? ` (${entry.patientName})` : '';
      const override = entry.overrideStatus ? ` [${entry.overrideStatus}]` : '';
      lines.push(
        `  ${entry.encounterId} / ${entry.patientId}${name} - ` +
          `${entry.serviceDate.toISOString().slice(0, 10)} - ` +
          `${entry.daysUnbilled}d - ${entry.amount.toFixed(2)}${override}`
      );
    }
    lines.push('');
  }

  const fontSize = 10;
  const lineHeight = 14;
  const marginLeft = 40;
  const marginTop = 40;
  const pageHeight = 792;
  const pageWidth = 612;
  const maxLinesPerPage = Math.floor((pageHeight - marginTop * 2) / lineHeight);

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  // Object 1: Catalog, Object 2: Pages, Object 3: Font
  // Then for each page: page object + content stream object.
  const firstPageObjectId = 4;
  for (let i = 0; i < pages.length; i++) {
    pageObjectIds.push(firstPageObjectId + i * 2);
  }

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] /Count ${pages.length} >>`
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  for (let i = 0; i < pages.length; i++) {
    const pageId = pageObjectIds[i];
    const contentId = pageId + 1;
    const pageLines = pages[i];
    const contentParts: string[] = ['BT', `/F1 ${fontSize} Tf`, `${lineHeight} TL`];
    contentParts.push(`1 0 0 1 ${marginLeft} ${pageHeight - marginTop} Tm`);
    for (const line of pageLines) {
      contentParts.push(`(${escapePdfText(line)}) Tj T*`);
    }
    contentParts.push('ET');
    const content = contentParts.join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}