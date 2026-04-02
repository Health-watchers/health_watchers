import { Schema } from 'mongoose';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { UserModel } from '../../modules/auth/models/user.model';

/**
 * Confirms that clinicId is stored as String across all models so that
 * queries using req.user.clinicId (a JWT string) match correctly in every
 * collection.
 */
describe('clinicId cross-collection type consistency', () => {
  function getClinicIdSchemaType(model: { schema: Schema }): string {
    const path = model.schema.path('clinicId');
    if (!path) throw new Error(`clinicId path not found on ${model}`);
    // instance is 'String', 'ObjectID', 'Number', etc.
    return (path as unknown as { instance: string }).instance;
  }

  it('EncounterModel.clinicId is String', () => {
    expect(getClinicIdSchemaType(EncounterModel)).toBe('String');
  });

  it('PatientModel.clinicId is String', () => {
    expect(getClinicIdSchemaType(PatientModel as unknown as { schema: Schema })).toBe('String');
  });

  it('UserModel.clinicId is String', () => {
    expect(getClinicIdSchemaType(UserModel as unknown as { schema: Schema })).toBe('String');
  });

  it('all three models agree on the same clinicId type', () => {
    const types = [EncounterModel, PatientModel, UserModel].map(
      (m) => getClinicIdSchemaType(m as unknown as { schema: Schema })
    );
    expect(new Set(types).size).toBe(1);
  });
});
