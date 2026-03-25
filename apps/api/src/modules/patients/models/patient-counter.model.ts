import { Schema, model, models } from 'mongoose';
const s = new Schema({ _id: { type: String, required: true }, value: { type: Number, default: 1000 } }, { versionKey: false });
export const PatientCounterModel = models.PatientCounter || model('PatientCounter', s);
