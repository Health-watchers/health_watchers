import { Schema, model, models } from 'mongoose';

export interface PatientDocument {
  systemId: string; firstName: string; lastName: string;
  dateOfBirth: Date; sex: 'M' | 'F' | 'O';
  contactNumber: string; address: string;
  isActive: boolean; clinicId: string; searchName: string;
}

const s = new Schema({
  systemId:      { type: String, required: true, trim: true, unique: true, index: true },
  firstName:     { type: String, required: true, trim: true },
  lastName:      { type: String, required: true, trim: true },
  dateOfBirth:   { type: Date,   required: true },
  sex:           { type: String, enum: ['M','F','O'], required: true },
  contactNumber: { type: String, required: true, trim: true },
  address:       { type: String, required: true, trim: true },
  isActive:      { type: Boolean, default: true, index: true },
  clinicId:      { type: String, required: true, index: true },
  searchName:    { type: String, required: true, trim: true, index: true },
}, { timestamps: true, versionKey: false });

s.index({ firstName: 'text', lastName: 'text', systemId: 'text' });
s.index({ clinicId: 1, lastName: 1, firstName: 1 });

export const PatientModel = models.Patient || model('Patient', s);
