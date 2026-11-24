import type { EncounterBillingInput } from './claim-builder';

/**
 * CMS-1500 (02/12) field validation, run before a claim is generated or transmitted so that
 * avoidable clearinghouse rejections are caught up-front.
 */

export interface ClaimFieldError {
  /** CMS-1500 box (e.g. "24D") or input field the error refers to */
  field: string;
  message: string;
}

export interface ClaimValidationResult {
  valid: boolean;
  errors: ClaimFieldError[];
}

/** CMS-1500 limits */
export const MAX_DIAGNOSIS_CODES = 12;
export const MAX_SERVICE_LINES = 6;
export const MAX_CHARGE_PER_LINE = 99_999.99;

const CPT_RE = /^(\d{4}[0-9A-Z]|[A-V]\d{4})$/i; // CPT (incl. Cat II/III) or HCPCS Level II
const ICD10_RE = /^[A-Z][0-9][0-9A-Z](\.?[0-9A-Z]{1,4})?$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * NPI check digit (Luhn over "80840" + first 9 digits), per CMS NPI standard.
 */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi.slice(0, 9)}`.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, double = true; i >= 0; i--, double = !double) {
    let d = digits[i];
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(npi[9]);
}

export function isValidCpt(code: string): boolean {
  return CPT_RE.test(code.trim());
}

export function isValidIcd10(code: string): boolean {
  return ICD10_RE.test(code.trim());
}

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function validateClaimInput(
  input: Partial<EncounterBillingInput>,
  now: Date = new Date()
): ClaimValidationResult {
  const errors: ClaimFieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });

  // Box 2 — patient name ("Last, First" preferred)
  if (!input.patientName?.trim()) add('2', 'Patient name is required');
  else if (input.patientName.length > 60) add('2', 'Patient name must be 60 characters or fewer');

  // Box 3 — patient date of birth
  const dob = input.patientDob ? parseIsoDate(input.patientDob) : null;
  if (!input.patientDob) add('3', 'Patient date of birth is required');
  else if (!dob) add('3', 'Patient date of birth must be a valid YYYY-MM-DD date');
  else if (dob > now) add('3', 'Patient date of birth cannot be in the future');

  // Box 24A — date of service
  const dos = input.serviceDate ? parseIsoDate(input.serviceDate) : null;
  if (!input.serviceDate) add('24A', 'Date of service is required');
  else if (!dos) add('24A', 'Date of service must be a valid YYYY-MM-DD date');
  else {
    if (dos > now) add('24A', 'Date of service cannot be in the future');
    if (dob && dos < dob) add('24A', 'Date of service cannot be before the date of birth');
  }

  // Box 21 — ICD-10 diagnosis codes
  const dx = input.diagnosisCodes ?? [];
  if (dx.length === 0) add('21', 'At least one ICD-10 diagnosis code is required');
  if (dx.length > MAX_DIAGNOSIS_CODES) {
    add('21', `No more than ${MAX_DIAGNOSIS_CODES} diagnosis codes are allowed`);
  }
  dx.forEach((code, i) => {
    if (!isValidIcd10(code)) add(`21.${String.fromCharCode(65 + i)}`, `Invalid ICD-10 code "${code}"`);
  });
  if (new Set(dx.map((c) => c.trim().toUpperCase())).size !== dx.length) {
    add('21', 'Diagnosis codes must not be duplicated');
  }

  // Box 24D / 24F — service lines
  const cpt = input.cptCodes ?? [];
  const amounts = input.amounts ?? [];
  if (cpt.length === 0) add('24D', 'At least one CPT/HCPCS procedure code is required');
  if (cpt.length > MAX_SERVICE_LINES) {
    add('24D', `A CMS-1500 form holds at most ${MAX_SERVICE_LINES} service lines`);
  }
  if (amounts.length !== cpt.length) add('24F', 'Each procedure code needs exactly one charge');
  cpt.forEach((code, i) => {
    if (!isValidCpt(code)) add(`24D.${i + 1}`, `Invalid CPT/HCPCS code "${code}"`);
  });
  amounts.forEach((amount, i) => {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      add(`24F.${i + 1}`, 'Charge must be a number');
    } else if (amount <= 0) {
      add(`24F.${i + 1}`, 'Charge must be greater than zero');
    } else if (amount > MAX_CHARGE_PER_LINE) {
      add(`24F.${i + 1}`, `Charge cannot exceed ${MAX_CHARGE_PER_LINE.toFixed(2)}`);
    } else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      add(`24F.${i + 1}`, 'Charge cannot have more than two decimal places');
    }
  });

  // Box 33a — billing provider NPI
  if (!input.clinicNpi) add('33a', 'Billing provider NPI is required');
  else if (!isValidNpi(input.clinicNpi)) add('33a', 'Billing provider NPI is not a valid NPI');

  return { valid: errors.length === 0, errors };
}

/** Re-derives the builder input from a stored claim so it can be re-validated. */
export function claimToBillingInput(claim: {
  encounterId: unknown;
  patientId: unknown;
  clinicId: unknown;
  cptCodes: string[];
  diagnosisCodes: string[];
  cms1500Data?: Record<string, any>;
}): EncounterBillingInput {
  const cms = claim.cms1500Data ?? {};
  const lines: Array<Record<string, any>> = cms.box24_servicelines ?? [];
  return {
    encounterId: String(claim.encounterId),
    patientId: String((claim.patientId as any)?._id ?? claim.patientId),
    clinicId: String(claim.clinicId),
    clinicNpi: String(cms.box33_billingProviderNpi ?? ''),
    patientDob: String(cms.box3_patientDob ?? ''),
    patientName: String(cms.box2_patientName ?? ''),
    serviceDate: String(lines[0]?.dateOfService ?? ''),
    cptCodes: claim.cptCodes,
    diagnosisCodes: claim.diagnosisCodes,
    amounts: claim.cptCodes.map((_, i) => Number(lines[i]?.charges ?? 0)),
  };
}
