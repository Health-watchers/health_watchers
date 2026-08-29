/**
 * Clinical Data Validator
 * Validates medications, lab results, allergies, vaccines
 * Issue #1237
 */

export interface MedicationValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Common medications database (simplified)
const COMMON_MEDICATIONS = new Map<string, { dosageUnits: string[]; contraindications?: string[] }>([
  ['aspirin', { dosageUnits: ['mg'], contraindications: ['warfarin', 'clopidogrel'] }],
  ['metformin', { dosageUnits: ['mg'], contraindications: [] }],
  ['lisinopril', { dosageUnits: ['mg'], contraindications: ['potassium-sparing diuretics'] }],
  ['atorvastatin', { dosageUnits: ['mg'], contraindications: [] }],
  ['amoxicillin', { dosageUnits: ['mg', 'ml'], contraindications: ['penicillin allergy'] }],
]);

// Lab value normal ranges
const LAB_NORMAL_RANGES = new Map<string, { min: number; max: number; unit: string }>([
  ['hemoglobin', { min: 12.0, max: 17.5, unit: 'g/dL' }],
  ['glucose', { min: 70, max: 100, unit: 'mg/dL' }],
  ['cholesterol', { min: 0, max: 200, unit: 'mg/dL' }],
  ['creatinine', { min: 0.6, max: 1.2, unit: 'mg/dL' }],
  ['potassium', { min: 3.5, max: 5.0, unit: 'mEq/L' }],
]);

// Known vaccine codes
const VACCINE_CODES = new Set([
  '003', // Measles
  '021', // Varicella
  '051', // Influenza
  '121', // Rotavirus
  '130', // Pneumococcal
  '165', // HPV
  '003', // COVID-19
]);

export class ClinicalDataValidator {
  /**
   * Validate medication
   */
  validateMedication(
    medication: {
      name: string;
      dosage: number;
      unit: string;
      frequency?: string;
      route?: string;
    },
    allergies?: string[]
  ): MedicationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!medication.name || medication.name.trim().length === 0) {
      errors.push('Medication name is required');
      return { valid: false, errors };
    }

    const medName = medication.name.toLowerCase();
    const medInfo = COMMON_MEDICATIONS.get(medName);

    if (!medInfo) {
      warnings.push(`Medication "${medication.name}" not in common database - verify spelling`);
    }

    // Validate dosage
    if (medication.dosage <= 0) {
      errors.push('Dosage must be greater than 0');
    }

    if (medication.dosage > 1000) {
      warnings.push('Dosage appears unusually high - verify value');
    }

    // Check unit validity
    if (!medication.unit) {
      errors.push('Dosage unit is required');
    } else if (medInfo && !medInfo.dosageUnits.includes(medication.unit)) {
      errors.push(`Invalid unit for ${medication.name}. Expected: ${medInfo.dosageUnits.join(', ')}`);
    }

    // Check for contraindications
    if (medInfo && medInfo.contraindications && allergies) {
      const conflicts = medInfo.contraindications.filter((c) =>
        allergies.some((a) => a.toLowerCase().includes(c.toLowerCase()))
      );

      if (conflicts.length > 0) {
        errors.push(`Medication contraindicated for patient allergies: ${conflicts.join(', ')}`);
      }
    }

    // Validate route
    const validRoutes = ['oral', 'iv', 'im', 'sc', 'topical', 'inhaled', 'nasal'];
    if (medication.route && !validRoutes.includes(medication.route.toLowerCase())) {
      errors.push(`Invalid route: ${medication.route}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate lab result
   */
  validateLabResult(
    testName: string,
    value: number,
    unit: string
  ): MedicationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const normalRange = LAB_NORMAL_RANGES.get(testName.toLowerCase());

    if (!normalRange) {
      warnings.push(`Lab test "${testName}" not in database - verify name`);
    }

    if (isNaN(value)) {
      errors.push('Lab value must be a number');
      return { valid: false, errors };
    }

    if (value < 0 && testName !== 'temperature') {
      errors.push('Lab value cannot be negative');
    }

    if (normalRange) {
      if (unit !== normalRange.unit) {
        errors.push(`Expected unit: ${normalRange.unit}, got: ${unit}`);
      }

      if (value < normalRange.min || value > normalRange.max) {
        const status = value < normalRange.min ? 'LOW' : 'HIGH';
        warnings.push(
          `Lab value is ${status}. Normal range: ${normalRange.min}-${normalRange.max} ${normalRange.unit}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate allergy information
   */
  validateAllergy(allergy: {
    substance: string;
    severity?: string;
    reactionType?: string;
  }): MedicationValidationResult {
    const errors: string[] = [];

    if (!allergy.substance || allergy.substance.trim().length === 0) {
      errors.push('Allergy substance is required');
      return { valid: false, errors };
    }

    const validSeverities = ['mild', 'moderate', 'severe', 'life-threatening'];
    if (allergy.severity && !validSeverities.includes(allergy.severity.toLowerCase())) {
      errors.push(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`);
    }

    const validReactions = [
      'rash',
      'itching',
      'swelling',
      'anaphylaxis',
      'difficulty_breathing',
      'hives',
      'angioedema',
    ];
    if (
      allergy.reactionType &&
      !validReactions.includes(allergy.reactionType.toLowerCase().replace(' ', '_'))
    ) {
      console.warn(`Unknown reaction type: ${allergy.reactionType}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate vaccine
   */
  validateVaccine(vaccine: {
    code: string;
    name: string;
    date: Date;
    lot?: string;
    manufacturer?: string;
  }): MedicationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!vaccine.code || vaccine.code.trim().length === 0) {
      errors.push('Vaccine code is required');
    } else if (!VACCINE_CODES.has(vaccine.code)) {
      warnings.push(`Vaccine code "${vaccine.code}" not in standard database`);
    }

    if (!vaccine.name || vaccine.name.trim().length === 0) {
      errors.push('Vaccine name is required');
    }

    if (!vaccine.date) {
      errors.push('Vaccination date is required');
    } else {
      const vacDate = new Date(vaccine.date);
      const today = new Date();

      if (vacDate > today) {
        errors.push('Vaccination date cannot be in the future');
      }

      if (vacDate < new Date('1900-01-01')) {
        errors.push('Vaccination date appears invalid');
      }
    }

    if (vaccine.lot && vaccine.lot.length < 3) {
      warnings.push('Lot number appears unusually short');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate clinical note
   */
  validateClinicalNote(note: string, requiredFields?: string[]): MedicationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!note || note.trim().length === 0) {
      errors.push('Clinical note cannot be empty');
      return { valid: false, errors };
    }

    if (note.length < 10) {
      errors.push('Clinical note must be at least 10 characters');
    }

    // Check for required fields
    if (requiredFields) {
      for (const field of requiredFields) {
        if (!note.toLowerCase().includes(field.toLowerCase())) {
          warnings.push(`Note does not mention: ${field}`);
        }
      }
    }

    // Check for suspicious patterns
    if (note.length > 50000) {
      warnings.push('Clinical note is exceptionally long');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate interaction between medications
   */
  validateMedicationInteraction(medications: string[]): {
    interactions: Array<{ drug1: string; drug2: string; severity: string }>;
  } {
    // Simplified interaction checking
    const interactions: Array<{ drug1: string; drug2: string; severity: string }> = [];

    // Known interactions
    const knownInteractions = new Map([
      [['aspirin', 'warfarin'], 'high'],
      [['metformin', 'contrast'], 'medium'],
      [['lisinopril', 'potassium'], 'medium'],
    ]);

    const medLower = medications.map((m) => m.toLowerCase());

    for (const [[drug1, drug2], severity] of knownInteractions.entries()) {
      if (medLower.includes(drug1) && medLower.includes(drug2)) {
        interactions.push({
          drug1,
          drug2,
          severity,
        });
      }
    }

    return { interactions };
  }
}

export const clinicalDataValidator = new ClinicalDataValidator();
