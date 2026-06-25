import { Schema, model, models } from 'mongoose';
import { encrypt, decrypt } from '@api/lib/encrypt';
import { sanitizeText } from '@api/utils/sanitize';

const PHI_FIELDS = ['contactNumber', 'address', 'dateOfBirth'] as const;

// Insurance PHI fields that must be encrypted at rest
const INSURANCE_PHI_FIELDS = ['policyNumber', 'groupNumber'] as const;

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

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  address?: string;
  isPrimary: boolean;
}

export type CoverageType = 'HMO' | 'PPO' | 'EPO' | 'POS' | 'HDHP' | 'Medicare' | 'Medicaid' | 'other';

export interface IInsurance {
  provider: string;
  /** Encrypted PHI */
  policyNumber: string;
  /** Encrypted PHI */
  groupNumber?: string;
  coverageType: CoverageType;
  effectiveDate?: string;
  expirationDate?: string;
  isPrimary: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

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
  emergencyContacts?: IEmergencyContact[];
  insurance?: IInsurance[];
  riskScore?: number;
  riskLevel?: RiskLevel;
  riskFactors?: string[];
  riskFactorWeights?: Record<string, number>;
  lastRiskCalculatedAt?: Date;
  lastSummaryGeneratedAt?: Date;
  nextRiskReviewDate?: Date;
  photoUrl?: string;
  thumbnailUrl?: string;
}

const allergySchema = new Schema<IAllergy>(
  {
    allergen: { type: String, required: true, trim: true },
    allergenType: {
      type: String,
      enum: ['drug', 'food', 'environmental', 'other'],
      required: true,
    },
    reaction: { type: String, required: true },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'life-threatening'],
      required: true,
    },
    onsetDate: { type: Date },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: () => new Date() },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const emergencyContactSchema = new Schema<IEmergencyContact>(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const insuranceSchema = new Schema<IInsurance>(
  {
    provider: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true },
    groupNumber: { type: String },
    coverageType: {
      type: String,
      enum: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'other'],
      required: true,
    },
    effectiveDate: { type: String },
    expirationDate: { type: String },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
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
    address: { type: String },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    allergies: { type: [allergySchema], default: [] },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
    insurance: { type: [insuranceSchema], default: [] },
    riskScore: { type: Number, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    riskFactors: { type: [String], default: undefined },
    riskFactorWeights: { type: Map, of: Number, default: undefined },
    lastRiskCalculatedAt: { type: Date },
    lastSummaryGeneratedAt: { type: Date },
    nextRiskReviewDate: { type: Date },
    photoUrl: { type: String },
    thumbnailUrl: { type: String },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Dashboard aggregation: filter by clinic + date range, sorted by createdAt
patientSchema.index({ clinicId: 1, createdAt: -1 }, { name: 'clinicId_1_createdAt_-1' });

patientSchema.pre('save', function () {
  if (this.address) this.address = sanitizeText(this.address);
  for (const field of PHI_FIELDS) {
    const val = this[field] as string | undefined;
    if (val) (this as unknown as Record<string, unknown>)[field] = encrypt(val);
  }
  // Encrypt PHI fields within each insurance entry
  if (this.insurance) {
    for (const ins of this.insurance) {
      for (const field of INSURANCE_PHI_FIELDS) {
        const val = ins[field] as string | undefined;
        if (val) (ins as unknown as Record<string, unknown>)[field] = encrypt(val);
      }
    }
  }
});

patientSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, any> | null;
  if (!update) return;
  const target: Record<string, unknown> = (update.$set as Record<string, unknown>) ?? update;
  for (const field of PHI_FIELDS) {
    const val = target[field];
    if (typeof val === 'string') target[field] = encrypt(val);
  }
});

function decryptDoc(doc: unknown) {
  if (!doc || typeof doc !== 'object') return;
  const d = doc as Record<string, unknown>;
  for (const field of PHI_FIELDS) {
    const val = d[field] as string | undefined;
    if (val) d[field] = decrypt(val);
  }
  // Decrypt PHI fields within each insurance entry
  if (Array.isArray(d.insurance)) {
    for (const ins of d.insurance as Record<string, unknown>[]) {
      for (const field of INSURANCE_PHI_FIELDS) {
        const val = ins[field] as string | undefined;
        if (val) ins[field] = decrypt(val);
      }
    }
  }
}

function encryptUpdatePayload(update: Record<string, any>) {
  const target = update.$set ?? update;
  for (const field of PHI_FIELDS) {
    if (target[field]) target[field] = encrypt(target[field]);
  }
}

patientSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, any>;
  if (update) encryptUpdatePayload(update);
});

patientSchema.pre('updateMany', function () {
  const update = this.getUpdate() as Record<string, any>;
  if (update) encryptUpdatePayload(update);
});

patientSchema.post('save', function () {
  decryptDoc(this as unknown as Record<string, unknown>);
});
patientSchema.post('find', function (docs: Record<string, unknown>[]) {
  docs.forEach(decryptDoc);
});
patientSchema.post('findOne', decryptDoc);
patientSchema.post('findOneAndUpdate', decryptDoc);

patientSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const dob = new Date(this.dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
});

patientSchema.virtual('ageGroup').get(function () {
  const age = (this as any).age;
  if (age === null) return null;
  if (age < 1) return 'infant';
  if (age < 3) return 'toddler';
  if (age < 12) return 'child';
  if (age < 18) return 'adolescent';
  if (age < 65) return 'adult';
  return 'elderly';
});

export const PatientModel = models.Patient || model<Patient>('Patient', patientSchema);
