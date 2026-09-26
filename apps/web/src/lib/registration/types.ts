/**
 * Types for the multi-step patient registration wizard.
 */

export type RegistrationStepId =
  | 'identity'
  | 'insurance'
  | 'emergencyContact'
  | 'medicationHistory'
  | 'allergies'
  | 'consent'
  | 'review';

export interface IdentityInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssnLast4?: string;
  idDocumentType?: 'driversLicense' | 'passport' | 'stateId';
  idVerified: boolean;
}

export interface InsuranceInfo {
  provider: string;
  memberId: string;
  groupNumber?: string;
  cardFrontImageUrl?: string;
  cardBackImageUrl?: string;
  ocrConfidence?: number;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface MedicationEntry {
  name: string;
  dosage?: string;
  frequency?: string;
}

export interface AllergyEntry {
  substance: string;
  reaction?: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface ConsentRecord {
  treatmentConsent: boolean;
  hipaaAcknowledged: boolean;
  financialResponsibility: boolean;
  signedAt?: string;
}

export interface RegistrationState {
  identity: IdentityInfo;
  insurance: InsuranceInfo;
  emergencyContact: EmergencyContact;
  medications: MedicationEntry[];
  allergies: AllergyEntry[];
  consent: ConsentRecord;
  currentStep: RegistrationStepId;
  completedSteps: RegistrationStepId[];
  startedAt: string;
}

export const REGISTRATION_STEPS: RegistrationStepId[] = [
  'identity',
  'insurance',
  'emergencyContact',
  'medicationHistory',
  'allergies',
  'consent',
  'review',
];

export function createInitialRegistrationState(): RegistrationState {
  return {
    identity: { firstName: '', lastName: '', dateOfBirth: '', idVerified: false },
    insurance: { provider: '', memberId: '' },
    emergencyContact: { name: '', relationship: '', phone: '' },
    medications: [],
    allergies: [],
    consent: { treatmentConsent: false, hipaaAcknowledged: false, financialResponsibility: false },
    currentStep: 'identity',
    completedSteps: [],
    startedAt: new Date().toISOString(),
  };
}
