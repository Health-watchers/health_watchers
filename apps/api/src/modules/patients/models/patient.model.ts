import { Schema, model, models } from 'mongoose';
import { encrypt, decrypt } from '@api/lib/encrypt';
import { sanitizeText } from '@api/utils/sanitize';

const PHI_FIELDS = ['contactNumber', 'address', 'dateOfBirth'] as const;

export interface IAllergy {
  allergen: string;
  allergenType: 'drug' | 'food' | 'environmental' | 'other';
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  onsetDate?: Date;
  recordedBy: Schema.Types.ObjectId;
  recordedAt: Date;
  isActive: boolean;
}

export interface Patient {
  systemId: string;
  firstName: string;
  lastName: string;
  searchName: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  address?: string;
  clinicId: Schema.Types.ObjectId;
  isActive: boolean;
  allergies: IAllergy[];
}

const allergySchema = new Schema<IAllergy>(
  {
    allergen:     { type: String, required: true, trim: true },
    allergenType: { type: String, enum: ['drug', 'food', 'environmental', 'other'], required: true },
    reaction:     { type: String, required: true },
    severity:     { type: String, enum: ['mild', 'moderate', 'severe', 'life-threatening'], required: true },
    onsetDate:    { type: Date },
    recordedBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt:   { type: Date, default: () => new Date() },
    isActive:     { type: Boolean, default: true },
  },
  { _id: true },
);

const patientSchema = new Schema<Patient>(
  {
    systemId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    searchName: { type: String, required: true, index: true },
    dateOfBirth: { type: String, required: true },
    sex: { type: String, enum: ['M', 'F', 'O'], required: true },
    contactNumber: { type: String },
    address:       { type: String },
    clinicId:      { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    isActive:      { type: Boolean, default: true, index: true },
    allergies:     { type: [allergySchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

patientSchema.pre('save', function () {
  if (this.address) this.address = sanitizeText(this.address);
  for (const field of PHI_FIELDS) {
    const val = this[field] as string | undefined;
    if (val) (this as unknown as Record<string, unknown>)[field] = encrypt(val);
  }
});

function decryptDoc(doc: unknown) {
  if (!doc || typeof doc !== 'object') return;
  const d = doc as Record<string, unknown>;
  for (const field of PHI_FIELDS) {
    const val = d[field] as string | undefined;
    if (val) d[field] = decrypt(val);
  }
}

patientSchema.post('save', function () {
  decryptDoc(this as unknown as Record<string, unknown>);
});
patientSchema.post('find', function (docs: Record<string, unknown>[]) {
  docs.forEach(decryptDoc);
});
patientSchema.post('findOne', decryptDoc);
patientSchema.post('findOneAndUpdate', decryptDoc);

export const PatientModel = models.Patient || model<Patient>('Patient', patientSchema);
