/**
 * Test data factories for integration tests.
 *
 * Factories create real documents in the in-memory MongoDB so tests exercise
 * the full model layer (encryption, hooks, validation) end to end. The auth
 * token helper signs a JWT that satisfies the real `authenticate` middleware
 * (issuer/audience/jti/signature checks).
 */
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ClinicModel } from '../../modules/clinics/clinic.model';
import { UserModel } from '../../modules/auth/models/user.model';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { AppointmentModel } from '../../modules/appointments/appointment.model';
import { PaymentRecordModel } from '../../modules/payments/models/payment-record.model';

export const TEST_ACCESS_SECRET = 'test-access-secret-32-chars-long!!';
export const TEST_ISSUER = 'health-watchers-api';
export const TEST_AUDIENCE = 'health-watchers-client';

// ── Auth tokens ───────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  role: string;
  clinicId: string;
}

/** Sign an access token that passes the real `authenticate` middleware. */
export function makeAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, TEST_ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

// ── Clinics ──────────────────────────────────────────────────────────────────

export function createClinic(
  overrides: Partial<{ name: string; address: string; phone: string; email: string }> = {}
) {
  return ClinicModel.create({
    name: 'Test Clinic',
    address: '123 Main St',
    phone: '555-0100',
    email: `clinic-${new mongoose.Types.ObjectId()}@example.com`,
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserOverrides {
  fullName?: string;
  email?: string;
  password?: string;
  role?: string;
  clinicId?: mongoose.Types.ObjectId | string;
  isActive?: boolean;
  emailVerified?: boolean;
}

export async function createUser(overrides: UserOverrides = {}) {
  const password = overrides.password ?? 'StrongPass123!';
  // Pass the PLAIN password — the UserModel pre-save hook hashes it.
  return UserModel.create({
    fullName: 'Test User',
    email: `user-${new mongoose.Types.ObjectId()}@example.com`,
    password,
    role: 'CLINIC_ADMIN',
    clinicId: overrides.clinicId ?? new mongoose.Types.ObjectId(),
    isActive: true,
    emailVerified: true,
    ...overrides,
  });
}

// ── Patients ─────────────────────────────────────────────────────────────────

export function createPatient(
  overrides: Partial<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    sex: 'M' | 'F' | 'O';
    contactNumber: string;
    clinicId: mongoose.Types.ObjectId;
  }> = {}
) {
  const firstName = overrides.firstName ?? 'Jane';
  const lastName = overrides.lastName ?? 'Doe';
  return PatientModel.create({
    systemId: `SYSTEM-${crypto.randomUUID()}`, // unique per the schema index
    firstName,
    lastName,
    dateOfBirth: '1990-05-15',
    sex: 'F',
    contactNumber: '+15551234567',
    searchName: `${firstName} ${lastName}`.toLowerCase(),
    clinicId: overrides.clinicId ?? new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

// ── Appointments ─────────────────────────────────────────────────────────────

export function createAppointment(
  overrides: Partial<{
    patientId: mongoose.Types.ObjectId;
    doctorId: mongoose.Types.ObjectId;
    clinicId: mongoose.Types.ObjectId;
    scheduledAt: Date;
    duration: number;
    type: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
    status: string;
  }> = {}
) {
  return AppointmentModel.create({
    patientId: overrides.patientId ?? new mongoose.Types.ObjectId(),
    doctorId: overrides.doctorId ?? new mongoose.Types.ObjectId(),
    clinicId: overrides.clinicId ?? new mongoose.Types.ObjectId(),
    scheduledAt: overrides.scheduledAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    duration: 30,
    type: 'consultation',
    status: 'scheduled',
    ...overrides,
  });
}

// ── Payments ─────────────────────────────────────────────────────────────────

export function createPayment(
  overrides: Partial<{
    intentId: string;
    amount: string;
    destination: string;
    clinicId: string;
    status: string;
    assetCode: string;
  }> = {}
) {
  return PaymentRecordModel.create({
    intentId: crypto.randomUUID(),
    amount: '10.00',
    destination: 'GDESTINATION123456789012345678901234567890123456',
    clinicId: new mongoose.Types.ObjectId().toString(),
    status: 'pending',
    assetCode: 'XLM',
    ...overrides,
  });
}

// ── Composed fixture: clinic + admin user ────────────────────────────────────

export interface ClinicFixture {
  clinic: Awaited<ReturnType<typeof createClinic>>;
  admin: Awaited<ReturnType<typeof createUser>>;
}

/** Create a clinic and a CLINIC_ADMIN user belonging to it. */
export async function createClinicWithAdmin(
  overrides: { password?: string } = {}
): Promise<ClinicFixture> {
  const clinic = await createClinic();
  const admin = await createUser({
    clinicId: clinic._id,
    role: 'CLINIC_ADMIN',
    password: overrides.password ?? 'StrongPass123!',
  });
  return { clinic, admin };
}
