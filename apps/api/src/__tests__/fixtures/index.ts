/**
 * Shared test fixtures — Issue #1066: Consolidate Test Fixtures
 *
 * This file provides pre-built fixture objects that combine multiple factories
 * into coherent, reusable test scenarios. Use these instead of assembling
 * individual factory calls when you need a complete, related data set.
 *
 * Usage:
 *   import { clinicScenario, billingScenario, encounterScenario } from '../fixtures';
 *
 * All fixtures are functions so each call returns a fresh object tree with
 * unique IDs — safe to call multiple times within the same test suite.
 */

import mongoose from 'mongoose';
import {
  buildPatient,
  buildPatientWithPhi,
  buildHighRiskPatient,
  buildInactivePatient,
  buildPatientBatch,
} from './patient.factory';
import {
  buildEncounter,
  buildEncounterWithDiagnosis,
  buildEncounterWithBilling,
  buildClosedEncounter,
  buildEncounterBatch,
} from './encounter.factory';
import {
  buildPayment,
  buildConfirmedPayment,
  buildEscrowPayment,
  buildExpiredPayment,
  buildEncounterPayment,
  buildPaymentBatch,
} from './payment.factory';
import {
  buildUser,
  buildDoctorUser,
  buildNurseUser,
  buildAdminUser,
  buildPatientUser,
  buildMfaUser,
  buildUserBatch,
} from './user.factory';

// ── Re-export all factories for convenience ──────────────────────────────────
export {
  // Patient factory
  buildPatient,
  buildPatientWithPhi,
  buildHighRiskPatient,
  buildInactivePatient,
  buildPatientBatch,
  // Encounter factory
  buildEncounter,
  buildEncounterWithDiagnosis,
  buildEncounterWithBilling,
  buildClosedEncounter,
  buildEncounterBatch,
  // Payment factory
  buildPayment,
  buildConfirmedPayment,
  buildEscrowPayment,
  buildExpiredPayment,
  buildEncounterPayment,
  buildPaymentBatch,
  // User factory
  buildUser,
  buildDoctorUser,
  buildNurseUser,
  buildAdminUser,
  buildPatientUser,
  buildMfaUser,
  buildUserBatch,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClinicScenario {
  clinicId: mongoose.Types.ObjectId;
  doctor: ReturnType<typeof buildDoctorUser>;
  nurse: ReturnType<typeof buildNurseUser>;
  admin: ReturnType<typeof buildAdminUser>;
  patients: ReturnType<typeof buildPatient>[];
}

export interface EncounterScenario {
  clinicId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  patient: ReturnType<typeof buildPatient>;
  openEncounter: ReturnType<typeof buildEncounter>;
  closedEncounter: ReturnType<typeof buildClosedEncounter>;
}

export interface BillingScenario {
  clinicId: mongoose.Types.ObjectId;
  patient: ReturnType<typeof buildPatient>;
  encounter: ReturnType<typeof buildEncounterWithBilling>;
  pendingPayment: ReturnType<typeof buildPayment>;
  confirmedPayment: ReturnType<typeof buildConfirmedPayment>;
  escrowPayment: ReturnType<typeof buildEscrowPayment>;
}

export interface HighRiskScenario {
  clinicId: mongoose.Types.ObjectId;
  patient: ReturnType<typeof buildHighRiskPatient>;
  doctor: ReturnType<typeof buildDoctorUser>;
  encounter: ReturnType<typeof buildEncounterWithDiagnosis>;
}

// ── Fixture Builders ──────────────────────────────────────────────────────────

/**
 * A standard clinic with staff and patients.
 * Useful for permission, role, and multi-user tests.
 */
export function clinicScenario(overrides: Partial<ClinicScenario> = {}): ClinicScenario {
  const clinicId = overrides.clinicId ?? new mongoose.Types.ObjectId();
  return {
    clinicId,
    doctor: buildDoctorUser({ clinicId }),
    nurse: buildNurseUser({ clinicId }),
    admin: buildAdminUser({ clinicId }),
    patients: buildPatientBatch(3, { clinicId }),
    ...overrides,
  };
}

/**
 * A patient with open and closed encounters at the same clinic.
 * Useful for encounter list, status filter, and doctor workload tests.
 */
export function encounterScenario(overrides: Partial<EncounterScenario> = {}): EncounterScenario {
  const clinicId = overrides.clinicId ?? new mongoose.Types.ObjectId();
  const doctorId = overrides.doctorId ?? new mongoose.Types.ObjectId();
  const patient = overrides.patient ?? buildPatient({ clinicId });
  const patientId = (patient as any)._id ?? new mongoose.Types.ObjectId();

  return {
    clinicId,
    doctorId,
    patient,
    openEncounter: buildEncounter({
      clinicId,
      patientId,
      attendingDoctorId: doctorId,
      status: 'open',
    }) as ReturnType<typeof buildEncounter>,
    closedEncounter: buildClosedEncounter({
      clinicId,
      patientId,
      attendingDoctorId: doctorId,
    }) as ReturnType<typeof buildClosedEncounter>,
    ...overrides,
  };
}

/**
 * A patient with a billed encounter and associated payments.
 * Useful for billing, invoice, and payment reconciliation tests.
 */
export function billingScenario(overrides: Partial<BillingScenario> = {}): BillingScenario {
  const clinicId = overrides.clinicId ?? new mongoose.Types.ObjectId();
  const patient = overrides.patient ?? buildPatientWithPhi({ clinicId });

  return {
    clinicId,
    patient,
    encounter: buildEncounterWithBilling({ clinicId }) as ReturnType<
      typeof buildEncounterWithBilling
    >,
    pendingPayment: buildPayment({
      clinicId: clinicId.toString(),
      status: 'pending',
    }) as ReturnType<typeof buildPayment>,
    confirmedPayment: buildConfirmedPayment({
      clinicId: clinicId.toString(),
    }) as ReturnType<typeof buildConfirmedPayment>,
    escrowPayment: buildEscrowPayment({
      clinicId: clinicId.toString(),
    }) as ReturnType<typeof buildEscrowPayment>,
    ...overrides,
  };
}

/**
 * A high-risk patient with an active diagnosis encounter.
 * Useful for AI risk stratification, CDS rule, and alert tests.
 */
export function highRiskScenario(overrides: Partial<HighRiskScenario> = {}): HighRiskScenario {
  const clinicId = overrides.clinicId ?? new mongoose.Types.ObjectId();
  const doctorId = new mongoose.Types.ObjectId();
  const patient = overrides.patient ?? buildHighRiskPatient({ clinicId });

  return {
    clinicId,
    patient,
    doctor: buildDoctorUser({ clinicId, _id: doctorId } as any),
    encounter: buildEncounterWithDiagnosis({
      clinicId,
      attendingDoctorId: doctorId,
    }) as ReturnType<typeof buildEncounterWithDiagnosis>,
    ...overrides,
  };
}

/**
 * A minimal set of expired and failed payment fixtures.
 * Useful for payment expiration job and retry logic tests.
 */
export function expiredPaymentsScenario(clinicId?: mongoose.Types.ObjectId) {
  const cId = clinicId ?? new mongoose.Types.ObjectId();
  return {
    clinicId: cId,
    expiredPayments: buildPaymentBatch(3, {
      clinicId: cId.toString(),
      status: 'pending',
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }).map((p) => buildExpiredPayment({ clinicId: cId.toString(), ...p })),
  };
}

/**
 * MFA-related user fixtures.
 * Useful for authentication and MFA enforcement tests.
 */
export function mfaScenario(clinicId?: mongoose.Types.ObjectId) {
  const cId = clinicId ?? new mongoose.Types.ObjectId();
  return {
    clinicId: cId,
    userWithMfa: buildMfaUser({ clinicId: cId }),
    userWithoutMfa: buildDoctorUser({ clinicId: cId, mfaEnabled: false }),
    adminWithMfa: buildAdminUser({
      clinicId: cId,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    } as any),
  };
}
