/**
 * Unit tests for the shared baseSchema.
 *
 * Verifies that all Mongoose models that use the baseSchema have the
 * required base fields (clinicId, isActive, createdBy) consistently present.
 */

import { Schema } from 'mongoose';
import { baseSchema } from '@api/shared';
import { AppointmentModel } from '../../modules/appointments/appointment.model';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { UserModel } from '../../modules/auth/models/user.model';
import { ClinicModel } from '../../modules/clinics/clinic.model';
import { InsuranceClaimModel } from '../../modules/billing/claim.model';

const BASE_FIELDS = ['clinicId', 'isActive', 'createdBy'];

describe('baseSchema', () => {
  describe('schema definition', () => {
    it('defines clinicId as an ObjectId ref to Clinic', () => {
      const path = baseSchema.path('clinicId');
      expect(path).toBeDefined();
      expect(path.instance).toBe('ObjectID');
    });

    it('defines isActive as a Boolean with default true', () => {
      const path = baseSchema.path('isActive');
      expect(path).toBeDefined();
      expect(path.instance).toBe('Boolean');
    });

    it('defines createdBy as an ObjectId ref to User', () => {
      const path = baseSchema.path('createdBy');
      expect(path).toBeDefined();
      expect(path.instance).toBe('ObjectID');
    });
  });

  describe('model composition', () => {
    const models = [
      { name: 'Appointment', model: AppointmentModel },
      { name: 'Encounter', model: EncounterModel },
      { name: 'Patient', model: PatientModel },
      { name: 'User', model: UserModel },
      { name: 'Clinic', model: ClinicModel },
      { name: 'InsuranceClaim', model: InsuranceClaimModel },
    ];

    for (const { name, model } of models) {
      describe(name, () => {
        for (const field of BASE_FIELDS) {
          it(`has ${field} in its schema`, () => {
            const schema = model.schema;
            const path = schema.path(field);
            expect(path).toBeDefined();
            expect(path).not.toBeNull();
          });
        }
      });
    }
  });

  describe('schema composition via add()', () => {
    it('baseSchema fields are accessible via schema.path() after add()', () => {
      const testSchema = new Schema({ name: { type: String, required: true } });
      testSchema.add(baseSchema);

      for (const field of BASE_FIELDS) {
        const path = testSchema.path(field);
        expect(path).toBeDefined();
        expect(path).not.toBeNull();
      }
    });

    it('baseSchema does not introduce an _id sub-document', () => {
      expect(baseSchema.options._id).toBe(false);
    });

    it('baseSchema does not enable timestamps (models handle timestamps separately)', () => {
      expect(baseSchema.options.timestamps).toBe(false);
    });
  });
});
