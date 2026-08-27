/**
 * Tests for shared fixtures (Issue #1066 — Consolidate Test Fixtures).
 *
 * Verifies that each scenario builder produces the expected shape and
 * that repeated calls produce independent objects (no shared state).
 */

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));

import mongoose from 'mongoose';
import {
  clinicScenario,
  encounterScenario,
  billingScenario,
  highRiskScenario,
  expiredPaymentsScenario,
  mfaScenario,
  // Individual re-exports
  buildPatient,
  buildDoctorUser,
  buildPayment,
} from '../fixtures';

describe('Shared Fixtures', () => {
  describe('clinicScenario', () => {
    it('produces a doctor, nurse, admin, and patients with the same clinicId', () => {
      const s = clinicScenario();
      expect(s.clinicId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(s.doctor.role).toBe('DOCTOR');
      expect(s.nurse.role).toBe('NURSE');
      expect(s.admin.role).toBe('CLINIC_ADMIN');
      expect(s.patients).toHaveLength(3);
      s.patients.forEach((p) =>
        expect(p.clinicId.toString()).toBe(s.clinicId.toString())
      );
    });

    it('accepts a custom clinicId override', () => {
      const clinicId = new mongoose.Types.ObjectId();
      const s = clinicScenario({ clinicId });
      expect(s.clinicId.toString()).toBe(clinicId.toString());
    });

    it('each call returns a distinct clinicId', () => {
      const s1 = clinicScenario();
      const s2 = clinicScenario();
      expect(s1.clinicId.toString()).not.toBe(s2.clinicId.toString());
    });
  });

  describe('encounterScenario', () => {
    it('produces open and closed encounters with matching clinicId', () => {
      const s = encounterScenario();
      expect(s.openEncounter.status).toBe('open');
      expect(s.closedEncounter.status).toBe('closed');
      expect(s.openEncounter.clinicId?.toString()).toBe(s.clinicId.toString());
    });

    it('uses the provided clinicId for all entities', () => {
      const clinicId = new mongoose.Types.ObjectId();
      const s = encounterScenario({ clinicId });
      expect(s.clinicId.toString()).toBe(clinicId.toString());
    });
  });

  describe('billingScenario', () => {
    it('produces a patient, encounter, and three payment states', () => {
      const s = billingScenario();
      expect(s.patient).toBeDefined();
      expect(s.encounter).toBeDefined();
      expect(s.pendingPayment.status).toBe('pending');
      expect(s.confirmedPayment.status).toBe('confirmed');
      expect(s.escrowPayment.paymentType).toBe('escrow');
    });

    it('all payments share the same clinicId', () => {
      const s = billingScenario();
      const cId = s.clinicId.toString();
      expect(s.pendingPayment.clinicId).toBe(cId);
      expect(s.confirmedPayment.clinicId).toBe(cId);
      expect(s.escrowPayment.clinicId).toBe(cId);
    });
  });

  describe('highRiskScenario', () => {
    it('produces a high-risk patient with riskScore and a doctor', () => {
      const s = highRiskScenario();
      expect(s.patient.riskScore).toBeGreaterThanOrEqual(80);
      expect(s.doctor.role).toBe('DOCTOR');
      expect(s.encounter.diagnosis).toBeDefined();
    });
  });

  describe('expiredPaymentsScenario', () => {
    it('produces expired payments with past expiresAt dates', () => {
      const s = expiredPaymentsScenario();
      expect(s.expiredPayments).toHaveLength(3);
      s.expiredPayments.forEach((p) => {
        expect(p.expiresAt!.getTime()).toBeLessThan(Date.now());
      });
    });
  });

  describe('mfaScenario', () => {
    it('produces a user with MFA enabled and one without', () => {
      const s = mfaScenario();
      expect(s.userWithMfa.mfaEnabled).toBe(true);
      expect(s.userWithoutMfa.mfaEnabled).toBe(false);
    });
  });

  describe('re-exported factories', () => {
    it('buildPatient is accessible from the fixtures module', () => {
      const p = buildPatient();
      expect(p.firstName).toBeDefined();
      expect(p.isActive).toBe(true);
    });

    it('buildDoctorUser is accessible from the fixtures module', () => {
      const u = buildDoctorUser();
      expect(u.role).toBe('DOCTOR');
    });

    it('buildPayment is accessible from the fixtures module', () => {
      const pay = buildPayment();
      expect(pay.status).toBe('pending');
    });
  });
});
