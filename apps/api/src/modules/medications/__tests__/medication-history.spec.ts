import mongoose from 'mongoose';
import { MedicationHistoryModel } from '../medication-history.model';

const patientId = new mongoose.Types.ObjectId();
const encounterId = new mongoose.Types.ObjectId();
const doctorId = new mongoose.Types.ObjectId();

const baseDoc = {
  patientId,
  encounterId,
  prescribingDoctorId: doctorId,
  medicationName: 'Metformin',
  dosage: '500mg',
  frequency: 'twice daily',
  startDate: new Date('2024-01-01'),
  active: true,
};

describe('MedicationHistoryModel', () => {
  it('validates a complete medication record', async () => {
    const med = new MedicationHistoryModel(baseDoc);
    await expect(med.validate()).resolves.toBeUndefined();
  });

  it('requires medicationName', async () => {
    const med = new MedicationHistoryModel({ ...baseDoc, medicationName: undefined });
    await expect(med.validate()).rejects.toThrow(/medicationName/);
  });

  it('defaults active to true', () => {
    const med = new MedicationHistoryModel({ ...baseDoc });
    expect(med.active).toBe(true);
  });

  it('stores refill history entries', async () => {
    const med = new MedicationHistoryModel({
      ...baseDoc,
      refillHistory: [
        { refillDate: new Date(), dispensedQuantity: 60, pharmacyNotes: 'Generic dispensed' },
      ],
    });
    await expect(med.validate()).resolves.toBeUndefined();
    expect(med.refillHistory.length).toBe(1);
    expect(med.refillHistory[0].dispensedQuantity).toBe(60);
  });

  it('stores interaction warnings as string array', async () => {
    const med = new MedicationHistoryModel({
      ...baseDoc,
      interactionWarnings: ['Avoid grapefruit juice', 'Monitor blood glucose'],
    });
    await expect(med.validate()).resolves.toBeUndefined();
    expect(med.interactionWarnings.length).toBe(2);
  });
});
