import { createHash } from 'crypto';

export type AnonymizationLevel = 'de-identification' | 'pseudonymization' | 'aggregation';

export interface AnonymizationOptions {
  level: AnonymizationLevel;
  sessionId?: string;
  purpose?: 'ai' | 'research' | 'export';
}

export interface PatientData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  contactNumber?: string;
  address?: string;
  email?: string;
  systemId?: string;
  clinicalNotes?: string;
  [key: string]: unknown;
}

export interface AnonymizedPatientData {
  firstName?: string | undefined;
  lastName?: string | undefined;
  dateOfBirth?: string | undefined;
  contactNumber?: string | undefined;
  address?: string | undefined;
  email?: string | undefined;
  systemId?: string | undefined;
  clinicalNotes?: string | undefined;
  [key: string]: unknown;
}

// PII regex patterns for clinical notes
const PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],
  [/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [
    /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi,
    '[ADDRESS]',
  ],
  [/\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-]\d{2,4}\b/g, '[DATE]'],
];

// Generate consistent hash for pseudonymization
function generateHash(value: string, sessionId: string = ''): string {
  return createHash('sha256')
    .update(value + sessionId)
    .digest('hex')
    .substring(0, 8);
}

// Calculate age range from date of birth
function getAgeRange(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  const rangeStart = Math.floor(age / 5) * 5;
  const rangeEnd = rangeStart + 4;
  return `${rangeStart}-${rangeEnd} years`;
}

// Extract city/region from address
function extractCityRegion(address: string): string {
  // Simple extraction - takes last two parts (city, state)
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    return parts.slice(-2).join(', ');
  }
  return '[REGION]';
}

// Strip PII from clinical notes
function stripPIIFromText(text: string, patientName?: string): string {
  let sanitized = text;

  // Replace patient name references
  if (patientName) {
    const namePattern = new RegExp(patientName, 'gi');
    sanitized = sanitized.replace(namePattern, 'the patient');
  }

  // Apply PII patterns
  for (const [pattern, replacement] of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Replace absolute dates with relative time (simplified)
  sanitized = sanitized.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    '[TIME_AGO]'
  );

  return sanitized;
}

// Level 1: De-identification - Remove direct identifiers
function deIdentify(data: PatientData, _options: AnonymizationOptions): AnonymizedPatientData {
  const patientName =
    data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined;

  return {
    ...data,
    firstName: undefined,
    lastName: undefined,
    contactNumber: '[REDACTED]',
    email: '[REDACTED]',
    address: data.address ? extractCityRegion(data.address) : undefined,
    dateOfBirth: data.dateOfBirth ? getAgeRange(data.dateOfBirth) : undefined,
    systemId: '[REDACTED]',
    clinicalNotes: data.clinicalNotes
      ? stripPIIFromText(data.clinicalNotes, patientName)
      : undefined,
  };
}

// Level 2: Pseudonymization - Replace with consistent pseudonyms
function pseudonymize(data: PatientData, options: AnonymizationOptions): AnonymizedPatientData {
  const sessionId = options.sessionId || '';
  const nameHash =
    data.firstName && data.lastName
      ? generateHash(`${data.firstName}${data.lastName}`, sessionId)
      : generateHash(data.systemId || '', sessionId);

  const patientName =
    data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined;

  return {
    ...data,
    firstName: `Patient`,
    lastName: nameHash,
    contactNumber: '[REDACTED]',
    email: '[REDACTED]',
    address: data.address ? extractCityRegion(data.address) : undefined,
    dateOfBirth: data.dateOfBirth ? getAgeRange(data.dateOfBirth) : undefined,
    systemId: data.systemId ? `ANON_${generateHash(data.systemId, sessionId)}` : undefined,
    clinicalNotes: data.clinicalNotes
      ? stripPIIFromText(data.clinicalNotes, patientName)
      : undefined,
  };
}

// Level 3: Aggregation - Only aggregate statistics
export interface AggregatedData {
  totalRecords: number;
  ageRanges: Record<string, number>;
  sexDistribution: Record<string, number>;
  [key: string]: unknown;
}

function aggregate(dataSet: PatientData[]): AggregatedData {
  const ageRanges: Record<string, number> = {};
  const sexDistribution: Record<string, number> = {};

  for (const data of dataSet) {
    // Age ranges
    if (data.dateOfBirth) {
      const range = getAgeRange(data.dateOfBirth);
      ageRanges[range] = (ageRanges[range] || 0) + 1;
    }

    // Sex distribution
    if (data.sex) {
      const sex = String(data.sex);
      sexDistribution[sex] = (sexDistribution[sex] || 0) + 1;
    }
  }

  return {
    totalRecords: dataSet.length,
    ageRanges,
    sexDistribution,
  };
}

// ---------------------------------------------------------------------------
// k-Anonymity helpers
// ---------------------------------------------------------------------------

export interface KAnonymityOptions {
  /** Minimum group size for a quasi-identifier combination to be released. */
  k: number;
  /** Width of the generalized age buckets (default 10 years). */
  ageBucketSize?: number;
  /** Replacement label used when a group is suppressed. */
  suppressionLabel?: string;
}

export interface KAnonymizedRecord {
  ageRange: string;
  city: string;
  sex: string;
  [key: string]: unknown;
}

export interface KAnonymityResult {
  records: KAnonymizedRecord[];
  /** Number of records removed because their group was smaller than k. */
  suppressedCount: number;
  /** Size of the smallest released equivalence class (0 when nothing released). */
  smallestGroupSize: number;
  k: number;
}

/**
 * Generalize a date of birth into a coarse age bucket (e.g. "30-39").
 * Wider buckets reduce re-identification risk at the cost of utility.
 */
export function generalizeAge(dateOfBirth: string, bucketSize: number = 10): string {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return '[UNKNOWN]';
  }
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 0) {
    return '[UNKNOWN]';
  }
  const size = bucketSize > 0 ? bucketSize : 10;
  const start = Math.floor(age / size) * size;
  return `${start}-${start + size - 1}`;
}

/**
 * Generalize a free-text address to a coarse city/region label.
 * Falls back to the suppression label when no usable region can be derived.
 */
export function generalizeLocation(address: string | undefined, suppressionLabel = '[REGION]'): string {
  if (!address) {
    return suppressionLabel;
  }
  const region = extractCityRegion(address);
  return region || suppressionLabel;
}

/**
 * Apply k-anonymity to a dataset by generalizing quasi-identifiers
 * (age, city, sex) and suppressing equivalence classes smaller than k.
 */
export function applyKAnonymity(
  dataSet: PatientData[],
  options: KAnonymityOptions
): KAnonymityResult {
  const k = Math.max(1, Math.floor(options.k));
  const bucketSize = options.ageBucketSize ?? 10;
  const suppressionLabel = options.suppressionLabel ?? '[REGION]';

  const generalized: KAnonymizedRecord[] = dataSet.map((data) => ({
    ageRange: data.dateOfBirth ? generalizeAge(data.dateOfBirth, bucketSize) : '[UNKNOWN]',
    city: generalizeLocation(data.address, suppressionLabel),
    sex: data.sex ? String(data.sex) : '[UNKNOWN]',
  }));

  // Count equivalence classes keyed by the generalized quasi-identifiers.
  const groupCounts = new Map<string, number>();
  for (const record of generalized) {
    const key = `${record.ageRange}|${record.city}|${record.sex}`;
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }

  const records: KAnonymizedRecord[] = [];
  let suppressedCount = 0;
  let smallestGroupSize = Number.POSITIVE_INFINITY;

  for (const record of generalized) {
    const key = `${record.ageRange}|${record.city}|${record.sex}`;
    const count = groupCounts.get(key) || 0;
    if (count >= k) {
      records.push(record);
      smallestGroupSize = Math.min(smallestGroupSize, count);
    } else {
      suppressedCount++;
    }
  }

  return {
    records,
    suppressedCount,
    smallestGroupSize: records.length > 0 ? smallestGroupSize : 0,
    k,
  };
}

// ---------------------------------------------------------------------------
// Differential privacy helpers
// ---------------------------------------------------------------------------

export interface DifferentialPrivacyOptions {
  /** Privacy budget. Smaller epsilon => more noise => stronger privacy. */
  epsilon: number;
  /** Global sensitivity of the query (default 1 for a single count). */
  sensitivity?: number;
  /** Optional deterministic RNG (returns [0,1)) for reproducible tests. */
  random?: () => number;
}

/**
 * Draw Laplace noise with the given scale (b = sensitivity / epsilon).
 */
export function laplaceNoise(scale: number, random: () => number = Math.random): number {
  const u = random() - 0.5;
  // Guard against log(0) when u === -0.5.
  const safeU = u === -0.5 ? -0.5 + Number.EPSILON : u;
  return -scale * Math.sign(safeU) * Math.log(1 - 2 * Math.abs(safeU));
}

/**
 * Add Laplace noise to a single aggregate count to satisfy epsilon-differential privacy.
 */
export function addLaplaceNoise(value: number, options: DifferentialPrivacyOptions): number {
  const epsilon = options.epsilon > 0 ? options.epsilon : 1;
  const sensitivity = options.sensitivity ?? 1;
  const scale = sensitivity / epsilon;
  const noisy = value + laplaceNoise(scale, options.random);
  // Counts must never be negative.
  return Math.max(0, Math.round(noisy));
}

/**
 * Add Laplace noise to every count in an aggregate report.
 */
export function privatizeAggregates(
  aggregates: Record<string, number>,
  options: DifferentialPrivacyOptions
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(aggregates)) {
    result[key] = addLaplaceNoise(value, options);
  }
  return result;
}

// Main anonymization function
export function anonymize(data: PatientData, options: AnonymizationOptions): AnonymizedPatientData {
  switch (options.level) {
    case 'de-identification':
      return deIdentify(data, options);
    case 'pseudonymization':
      return pseudonymize(data, options);
    default:
      throw new Error(`Unsupported anonymization level for single record: ${options.level}`);
  }
}

// Batch anonymization for aggregation
export function anonymizeBatch(
  dataSet: PatientData[],
  options: AnonymizationOptions
): AnonymizedPatientData[] | AggregatedData {
  if (options.level === 'aggregation') {
    return aggregate(dataSet);
  }

  return dataSet.map((data) => anonymize(data, options));
}

// Audit log entry
export interface AnonymizationAuditLog {
  timestamp: Date;
  dataAnonymized: string[];
  purpose: string;
  requestedBy: string;
  level: AnonymizationLevel;
  recordCount: number;
}

export function createAuditLog(
  fields: string[],
  purpose: string,
  requestedBy: string,
  level: AnonymizationLevel,
  recordCount: number = 1
): AnonymizationAuditLog {
  return {
    timestamp: new Date(),
    dataAnonymized: fields,
    purpose,
    requestedBy,
    level,
    recordCount,
  };
}

// ---------------------------------------------------------------------------
// Re-identification risk estimation
// ---------------------------------------------------------------------------

/** Documented threshold: a dataset is considered safe when risk is below this. */
export const RE_IDENTIFICATION_RISK_THRESHOLD = 0.2;

export interface ReIdentificationRisk {
  /** Fraction of records that belong to an equivalence class of size 1. */
  risk: number;
  /** Size of the smallest equivalence class. */
  smallestGroupSize: number;
  /** Total number of records evaluated. */
  recordCount: number;
  /** Whether the risk is below the documented threshold. */
  belowThreshold: boolean;
}

/**
 * Estimate re-identification risk as the proportion of records that are
 * unique on the generalized quasi-identifiers. A value below
 * RE_IDENTIFICATION_RISK_THRESHOLD is considered acceptable.
 */
export function estimateReIdentificationRisk(
  records: KAnonymizedRecord[],
  threshold: number = RE_IDENTIFICATION_RISK_THRESHOLD
): ReIdentificationRisk {
  if (records.length === 0) {
    return { risk: 0, smallestGroupSize: 0, recordCount: 0, belowThreshold: true };
  }

  const groupCounts = new Map<string, number>();
  for (const record of records) {
    const key = `${record.ageRange}|${record.city}|${record.sex}`;
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }

  let uniqueRecords = 0;
  let smallestGroupSize = Number.POSITIVE_INFINITY;
  for (const count of groupCounts.values()) {
    if (count === 1) {
      uniqueRecords++;
    }
    smallestGroupSize = Math.min(smallestGroupSize, count);
  }

  const risk = uniqueRecords / records.length;
  return {
    risk,
    smallestGroupSize,
    recordCount: records.length,
    belowThreshold: risk < threshold,
  };
}
