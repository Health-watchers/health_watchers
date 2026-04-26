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

// PII regex patterns for clinical notes
const PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [/\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi, '[ADDRESS]'],
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
  const parts = address.split(',').map(p => p.trim());
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
  sanitized = sanitized.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, '[TIME_AGO]');
  
  return sanitized;
}

// Level 1: De-identification - Remove direct identifiers
function deIdentify(data: PatientData, options: AnonymizationOptions): AnonymizedPatientData {
  const patientName = data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined;
  
  return {
    ...data,
    firstName: undefined,
    lastName: undefined,
    contactNumber: '[REDACTED]',
    email: '[REDACTED]',
    address: data.address ? extractCityRegion(data.address) : undefined,
    dateOfBirth: data.dateOfBirth ? getAgeRange(data.dateOfBirth) : undefined,
    systemId: '[REDACTED]',
    clinicalNotes: data.clinicalNotes ? stripPIIFromText(data.clinicalNotes, patientName) : undefined,
  };
}

// Level 2: Pseudonymization - Replace with consistent pseudonyms
function pseudonymize(data: PatientData, options: AnonymizationOptions): AnonymizedPatientData {
  const sessionId = options.sessionId || '';
  const nameHash = data.firstName && data.lastName 
    ? generateHash(`${data.firstName}${data.lastName}`, sessionId)
    : generateHash(data.systemId || '', sessionId);
  
  const patientName = data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined;
  
  return {
    ...data,
    firstName: `Patient`,
    lastName: nameHash,
    contactNumber: '[REDACTED]',
    email: '[REDACTED]',
    address: data.address ? extractCityRegion(data.address) : undefined,
    dateOfBirth: data.dateOfBirth ? getAgeRange(data.dateOfBirth) : undefined,
    systemId: data.systemId ? `ANON_${generateHash(data.systemId, sessionId)}` : undefined,
    clinicalNotes: data.clinicalNotes ? stripPIIFromText(data.clinicalNotes, patientName) : undefined,
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

// Main anonymization function
export function anonymize(
  data: PatientData,
  options: AnonymizationOptions
): AnonymizedPatientData {
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
  
  return dataSet.map(data => anonymize(data, options));
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
