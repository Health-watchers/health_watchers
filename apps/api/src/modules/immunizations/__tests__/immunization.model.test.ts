import mongoose from 'mongoose';
import { ImmunizationModel } from '../immunization.model';

const baseDoc = {
  patientId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  vaccineName: 'Influenza',
  vaccineCode: '88',
  administeredDate: new Date('2026-01-01'),
  doseNumber: 1,
  administeredBy: new mongoose.Types.ObjectId(),
};

describe('ImmunizationModel', () => {
  it('validates a complete immunization record', async () => {
    const imm = new ImmunizationModel(baseDoc);
    await expect(imm.validate()).resolves.toBeUndefined();
  });

  it('requires doseNumber to be at least 1', async () => {
    const imm = new ImmunizationModel({ ...baseDoc, doseNumber: 0 });
    await expect(imm.validate()).rejects.toThrow();
  });

  it('defaults seriesComplete to false and isActive to true', () => {
    const imm = new ImmunizationModel(baseDoc);
    expect(imm.seriesComplete).toBe(false);
    expect(imm.isActive).toBe(true);
  });

  it('rejects an invalid administration site', async () => {
    const imm = new ImmunizationModel({ ...baseDoc, site: 'Left ear' });
    await expect(imm.validate()).rejects.toThrow();
  });

  it('stores an embedded adverse reaction', async () => {
    const imm = new ImmunizationModel({
      ...baseDoc,
      adverseReaction: {
        description: 'Mild soreness at injection site',
        severity: 'mild',
        onsetDate: new Date(),
        reportedToVAERS: false,
      },
    });
    await expect(imm.validate()).resolves.toBeUndefined();
    expect(imm.adverseReaction?.severity).toBe('mild');
  });
});
