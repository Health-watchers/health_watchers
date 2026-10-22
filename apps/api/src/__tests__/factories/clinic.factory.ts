import mongoose from 'mongoose';
import type { Clinic } from '@api/modules/clinics/clinic.model';

let seq = 0;

function nextSeq() {
  return ++seq;
}

export function buildClinic(overrides: Partial<Clinic> = {}): Partial<Clinic> {
  const i = nextSeq();
  return {
    name: `Test Clinic ${i}`,
    address: {
      street: `${i} Medical Plaza`,
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      country: 'USA',
    },
    phone: `555-200-${String(i).padStart(4, '0')}`,
    email: `clinic${i}@example.com`,
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    stellar: {
      publicKey: `GCLINIC${i}${'A'.repeat(50 - 7 - String(i).length)}`,
      baseFee: '100000',
    },
    isActive: true,
    features: {
      telemedicine: true,
      aiSummaries: true,
      labIntegration: false,
      customBranding: false,
    },
    ...overrides,
  };
}

export function buildClinicWithFullFeatures(
  overrides: Partial<Clinic> = {}
): ReturnType<typeof buildClinic> {
  return buildClinic({
    subscriptionTier: 'enterprise',
    features: {
      telemedicine: true,
      aiSummaries: true,
      labIntegration: true,
      customBranding: true,
    },
    ...overrides,
  });
}

export function buildInactiveClinic(
  overrides: Partial<Clinic> = {}
): ReturnType<typeof buildClinic> {
  return buildClinic({
    isActive: false,
    subscriptionStatus: 'cancelled',
    ...overrides,
  });
}

export function buildClinicBatch(count: number, overrides: Partial<Clinic> = {}) {
  return Array.from({ length: count }, () => buildClinic(overrides));
}
