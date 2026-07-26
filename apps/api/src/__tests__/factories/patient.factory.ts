import mongoose from 'mongoose';
import type { Patient, IAllergy, IEmergencyContact, IInsurance } from '@api/modules/patients/models/patient.model';

let seq = 0;

function nextSeq() {
  return ++seq;
}

export function buildPatient(overrides: Partial<Patient> = {}): Omit<Patient, 'systemId'> & { systemId: string } {
  const i = nextSeq();
  return {
    systemId: `PAT-TEST-${i}-${Date.now()}`,
    firstName: 'Jane',
    lastName: `Doe${i}`,
    searchName: `jane doe${i}`,
    dateOfBirth: '1990-05-15',
    sex: 'F',
    clinicId: new mongoose.Types.ObjectId(),
    isActive: true,
    allergies: [],
    emergencyContacts: [],
    insurance: [],
    ...overrides,
  } as any;
}

export function buildAllergy(overrides: Partial<IAllergy> = {}): Omit<IAllergy, '_id'> {
  return {
    allergen: 'Penicillin',
    allergenType: 'drug',
    reaction: 'Rash',
    severity: 'moderate',
    recordedBy: new mongoose.Types.ObjectId(),
    recordedAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

export function buildEmergencyContact(overrides: Partial<IEmergencyContact> = {}): Omit<IEmergencyContact, '_id'> {
  return {
    name: 'John Doe',
    relationship: 'Spouse',
    phone: '555-000-0001',
    isPrimary: true,
    ...overrides,
  };
}

export function buildInsurance(overrides: Partial<IInsurance> = {}): Omit<IInsurance, '_id'> {
  return {
    provider: 'BlueCross BlueShield',
    policyNumber: `POL-${Date.now()}`,
    coverageType: 'PPO',
    isPrimary: true,
    ...overrides,
  };
}

export function buildPatientBatch(count: number, overrides: Partial<Patient> = {}) {
  return Array.from({ length: count }, () => buildPatient(overrides));
}
