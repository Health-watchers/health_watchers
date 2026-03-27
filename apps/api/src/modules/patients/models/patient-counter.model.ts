import { Schema, model, models } from 'mongoose';

const patientCounterSchema = new Schema(
  {
    _id:   { type: String, required: true }, // key: `patient_${clinicId}`
    value: { type: Number, required: true, default: 1000 },
  },
  { versionKey: false }
);

export const PatientCounterModel = models.PatientCounter || model('PatientCounter', patientCounterSchema);
