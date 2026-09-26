/**
 * Per-step validation with helpful, field-level error messages for the
 * patient registration wizard, plus a stub OCR parser for insurance cards.
 */

import type {
  AllergyEntry,
  ConsentRecord,
  EmergencyContact,
  IdentityInfo,
  InsuranceInfo,
  MedicationEntry,
  RegistrationStepId,
} from './types';

export interface FieldError {
  field: string;
  message: string;
}

export function validateIdentity(identity: IdentityInfo): FieldError[] {
  const errors: FieldError[] = [];
  if (!identity.firstName.trim()) errors.push({ field: 'firstName', message: 'First name is required.' });
  if (!identity.lastName.trim()) errors.push({ field: 'lastName', message: 'Last name is required.' });
  if (!identity.dateOfBirth) {
    errors.push({ field: 'dateOfBirth', message: 'Date of birth is required.' });
  } else if (new Date(identity.dateOfBirth) > new Date()) {
    errors.push({ field: 'dateOfBirth', message: 'Date of birth cannot be in the future.' });
  }
  if (!identity.idVerified) {
    errors.push({ field: 'idVerified', message: 'Please complete identity verification before continuing.' });
  }
  return errors;
}

export function validateInsurance(insurance: InsuranceInfo): FieldError[] {
  const errors: FieldError[] = [];
  if (!insurance.provider.trim()) errors.push({ field: 'provider', message: 'Insurance provider is required.' });
  if (!insurance.memberId.trim()) errors.push({ field: 'memberId', message: 'Member ID is required.' });
  if (insurance.ocrConfidence !== undefined && insurance.ocrConfidence < 0.9) {
    errors.push({
      field: 'cardFrontImageUrl',
      message: 'Insurance card scan confidence is low — please verify the details manually.',
    });
  }
  return errors;
}

export function validateEmergencyContact(contact: EmergencyContact): FieldError[] {
  const errors: FieldError[] = [];
  if (!contact.name.trim()) errors.push({ field: 'name', message: 'Emergency contact name is required.' });
  if (!contact.relationship.trim()) {
    errors.push({ field: 'relationship', message: 'Relationship to patient is required.' });
  }
  if (!/^[\d+()\-\s]{7,}$/.test(contact.phone)) {
    errors.push({ field: 'phone', message: 'Enter a valid phone number.' });
  }
  return errors;
}

export function validateMedications(medications: MedicationEntry[]): FieldError[] {
  return medications
    .filter((m) => !m.name.trim())
    .map(() => ({ field: 'medications', message: 'Medication name cannot be empty.' }));
}

export function validateAllergies(allergies: AllergyEntry[]): FieldError[] {
  return allergies
    .filter((a) => !a.substance.trim())
    .map(() => ({ field: 'allergies', message: 'Allergy substance cannot be empty.' }));
}

export function validateConsent(consent: ConsentRecord): FieldError[] {
  const errors: FieldError[] = [];
  if (!consent.treatmentConsent) errors.push({ field: 'treatmentConsent', message: 'Treatment consent is required.' });
  if (!consent.hipaaAcknowledged) {
    errors.push({ field: 'hipaaAcknowledged', message: 'You must acknowledge the HIPAA notice.' });
  }
  if (!consent.financialResponsibility) {
    errors.push({ field: 'financialResponsibility', message: 'Financial responsibility agreement is required.' });
  }
  return errors;
}

export function validateStep(
  step: RegistrationStepId,
  state: {
    identity: IdentityInfo;
    insurance: InsuranceInfo;
    emergencyContact: EmergencyContact;
    medications: MedicationEntry[];
    allergies: AllergyEntry[];
    consent: ConsentRecord;
  }
): FieldError[] {
  switch (step) {
    case 'identity':
      return validateIdentity(state.identity);
    case 'insurance':
      return validateInsurance(state.insurance);
    case 'emergencyContact':
      return validateEmergencyContact(state.emergencyContact);
    case 'medicationHistory':
      return validateMedications(state.medications);
    case 'allergies':
      return validateAllergies(state.allergies);
    case 'consent':
      return validateConsent(state.consent);
    case 'review':
      return [];
    default:
      return [];
  }
}

/**
 * Parses OCR output from an insurance card scan into structured fields.
 * The actual OCR call is delegated to a server route/vendor SDK; this
 * function normalizes the raw text result and estimates confidence.
 */
export function parseInsuranceCardOcr(rawText: string): Pick<InsuranceInfo, 'provider' | 'memberId' | 'groupNumber' | 'ocrConfidence'> {
  const memberIdMatch = rawText.match(/member\s*(?:id|#)?[:\s]+([A-Z0-9-]{5,})/i);
  const groupMatch = rawText.match(/group\s*(?:number|#)?[:\s]+([A-Z0-9-]{3,})/i);
  const providerMatch = rawText.match(/^(.*?)(?:\n|$)/);

  const fieldsFound = [memberIdMatch, groupMatch, providerMatch].filter(Boolean).length;
  const ocrConfidence = Math.min(1, 0.6 + fieldsFound * 0.15);

  return {
    provider: providerMatch?.[1]?.trim() ?? '',
    memberId: memberIdMatch?.[1]?.trim() ?? '',
    groupNumber: groupMatch?.[1]?.trim(),
    ocrConfidence,
  };
}
