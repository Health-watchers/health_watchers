/**
 * Medical Coding Validators
 * Validates ICD-10, CPT, SNOMED codes
 * Issue #1237
 */

// Simplified list of common ICD-10 codes
const ICD10_CODES = new Set([
  'A00',
  'A01',
  'A02',
  'A03',
  'A04',
  'A05', // Cholera, typhoid, etc.
  'E10',
  'E11',
  'E12',
  'E13', // Diabetes
  'I10',
  'I11',
  'I12',
  'I13', // Hypertension
  'J00',
  'J01',
  'J02',
  'J03', // Respiratory
  'M79', // Pain in limb
  'R00',
  'R01',
  'R02',
  'R03', // Symptoms
  'Z00',
  'Z01',
  'Z02',
  'Z03', // Encounters
]);

// Common CPT codes (sample)
const CPT_CODES = new Set([
  '99201',
  '99202',
  '99203',
  '99204',
  '99205', // Office visits
  '70450',
  '70451',
  '70452', // CT scans
  '93000',
  '93005',
  '93010', // EKG
  '80053',
  '80055', // Comprehensive metabolic panel
]);

// SNOMED CT sample
const SNOMED_CODES = new Set([
  '25064002', // Headache
  '386661006', // Fever
  '90560007', // Influenza
  '3723001', // Arthritis
]);

export class MedicalCodingValidator {
  /**
   * Validate ICD-10 code
   */
  validateICD10(code: string): {
    valid: boolean;
    error?: string;
  } {
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'ICD-10 code must be a string' };
    }

    const cleanCode = code.toUpperCase().trim();

    // ICD-10 format: Letter followed by 2 digits, optionally period and 1-2 characters
    if (!/^[A-Z]\d{2}(\.[A-Z\d]{1,2})?$/.test(cleanCode)) {
      return { valid: false, error: 'Invalid ICD-10 format (e.g., E11.22)' };
    }

    // Note: In production, validate against the complete ICD-10 database
    if (!ICD10_CODES.has(cleanCode.substring(0, 3))) {
      // Still return valid as long as format is correct, but log for review
      console.warn(`Unknown ICD-10 code: ${cleanCode}`);
    }

    return { valid: true };
  }

  /**
   * Validate CPT code
   */
  validateCPT(code: string): {
    valid: boolean;
    error?: string;
  } {
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'CPT code must be a string' };
    }

    const cleanCode = code.trim();

    // CPT codes are 5 digits, optionally with modifiers (-XX)
    if (!/^\d{5}(-\d{2})?$/.test(cleanCode)) {
      return { valid: false, error: 'Invalid CPT format (e.g., 99213 or 99213-25)' };
    }

    if (!CPT_CODES.has(cleanCode.substring(0, 5))) {
      console.warn(`Unknown CPT code: ${cleanCode}`);
    }

    return { valid: true };
  }

  /**
   * Validate SNOMED CT code
   */
  validateSNOMED(code: string): {
    valid: boolean;
    error?: string;
  } {
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'SNOMED CT code must be a string' };
    }

    const cleanCode = code.trim();

    // SNOMED CT codes are numeric (usually 6-18 digits)
    if (!/^\d{6,18}$/.test(cleanCode)) {
      return { valid: false, error: 'Invalid SNOMED CT format (numeric, 6-18 digits)' };
    }

    if (!SNOMED_CODES.has(cleanCode)) {
      console.warn(`Unknown SNOMED CT code: ${cleanCode}`);
    }

    return { valid: true };
  }

  /**
   * Batch validate medical codes
   */
  validateCodes(codes: Array<{ type: 'icd10' | 'cpt' | 'snomed'; code: string }>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const { type, code } of codes) {
      let result;
      switch (type) {
        case 'icd10':
          result = this.validateICD10(code);
          break;
        case 'cpt':
          result = this.validateCPT(code);
          break;
        case 'snomed':
          result = this.validateSNOMED(code);
          break;
      }

      if (!result.valid && result.error) {
        errors.push(`${type.toUpperCase()}: ${result.error}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const medicalCodingValidator = new MedicalCodingValidator();
