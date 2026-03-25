import mongoose, { Schema, Document } from 'mongoose';

export interface IPatient extends Document {
  clinicId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other';
  phone?: string;
}

const PatientSchema = new Schema<IPatient>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String },
  },
  { timestamps: true }
);

export const PatientModel = mongoose.model<IPatient>('Patient', PatientSchema);
