import mongoose from 'mongoose';
import type { User } from '@api/modules/auth/models/user.model';
import type { AppRole } from '@api/types/express';

let seq = 0;

function nextSeq() {
  return ++seq;
}

const defaultPreferences: User['preferences'] = {
  language: 'en',
  theme: 'system',
  emailNotifications: true,
  inAppNotifications: true,
  notificationTypes: {
    referral_received: true,
    payment_confirmed: true,
    appointment_reminder: true,
    ai_summary_ready: true,
    lab_result_ready: true,
    high_risk_patient: true,
    system: true,
    balance_low_warning: true,
    balance_critical: true,
    large_transaction: true,
    unrecognized_transaction: true,
    follow_up_reminder: true,
  },
};

export function buildUser(
  overrides: Partial<User> = {}
): Omit<User, 'password'> & { password: string } {
  const i = nextSeq();
  return {
    fullName: `Test User ${i}`,
    email: `testuser${i}@clinic.com`,
    password: 'SecurePass123!',
    role: 'DOCTOR' as AppRole,
    clinicId: new mongoose.Types.ObjectId(),
    isActive: true,
    emailVerified: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    failedMfaAttempts: 0,
    mustChangePassword: false,
    preferences: defaultPreferences,
    ...overrides,
  } as any;
}

export function buildDoctorUser(overrides: Partial<User> = {}): ReturnType<typeof buildUser> {
  return buildUser({ role: 'DOCTOR' as AppRole, ...overrides });
}

export function buildNurseUser(overrides: Partial<User> = {}): ReturnType<typeof buildUser> {
  return buildUser({ role: 'NURSE' as AppRole, ...overrides });
}

export function buildAdminUser(overrides: Partial<User> = {}): ReturnType<typeof buildUser> {
  return buildUser({ role: 'CLINIC_ADMIN' as AppRole, ...overrides });
}

export function buildPatientUser(overrides: Partial<User> = {}): ReturnType<typeof buildUser> {
  return buildUser({
    role: 'PATIENT' as AppRole,
    patientId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

export function buildMfaUser(overrides: Partial<User> = {}): ReturnType<typeof buildUser> {
  return buildUser({
    mfaEnabled: true,
    mfaSecret: 'JBSWY3DPEHPK3PXP', // base32 seed for TOTP tests
    ...overrides,
  });
}

export function buildUserBatch(count: number, overrides: Partial<User> = []) {
  return Array.from({ length: count }, () => buildUser(overrides as Partial<User>));
}
