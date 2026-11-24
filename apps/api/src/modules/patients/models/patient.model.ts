import { Schema, model, models } from 'mongoose';
import { encrypt, decrypt, blindIndex } from '@api/lib/encrypt';
import { sanitizeText } from '@api/utils/sanitize';
import { baseSchema } from '@api/shared';

// HIPAA Safe Harbor identifiers encrypted at rest with AES-256-GCM.
// `contactNumber` is the storage field for the patient's phone number.
const PHI_FIELDS = ['contactNumber', 'address', 'dateOfBirth', 'nationalId'] as const;

// Insurance PHI fields that must be encrypted at rest
const INSURANCE_PHI_FIELDS = ['policyNumber', 'groupNumber', 'insuranceNumber'] as const;

// Deterministic blind-index fields (HMAC-SHA256) enabling equality lookups
// without ever querying the encrypted ciphertext directly.
const PATIENT_BLIND_INDEX_FIELDS = {
  contactNumber: 'contactNumberHash',
  nationalId: 'nationalIdHash',
} as const;

const INSURANCE_BLIND_INDEX_FIELDS = {
  insuranceNumber: 'insuranceNumberHash',
} as const;

export interface IAllergy {
  _id?: Schema.Types.ObjectId;
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
  _id?: Schema.Types.ObjectId;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  address?: string;
  isPrimary: boolean;
}

export type CoverageType =
  | 'HMO'
  | 'PPO'
  | 'EPO'
  | 'POS'
  | 'HDHP'
  | 'Medicare'
  | 'Medicaid'
  | 'other';

export interface IInsurance {
  _id?: Schema.Types.ObjectId;
  provider: string;
  /** Encrypted PHI */
  policyNumber: string;
  /** Encrypted PHI */
  groupNumber?: string;
  /** Encrypted PHI — member/insurance number */
  insuranceNumber?: string;
  /** Deterministic blind index of `insuranceNumber` (never exposed) */
  insuranceNumberHash?: string;
  coverageType: CoverageType;
  effectiveDate?: string;
  expirationDate?: string;
  isPrimary: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PatientDocument {
  systemId: string;
  firstName: string;
  lastName: string;
  searchName: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  /** Deterministic blind index of `contactNumber` (never exposed) */
  contactNumberHash?: string;
  address?: string;
  /** Encrypted PHI — national identity number */
  nationalId?: string;
  /** Deterministic blind index of `nationalId` (never exposed) */
  nationalIdHash?: string;
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
  isDuplicate?: boolean;
  mergedInto?: Schema.Types.ObjectId;
}

/** @deprecated Use PatientDocument for persistence-layer values. */
export type Patient = PatientDocument;

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
    insuranceNumber: { type: String },
    insuranceNumberHash: { type: String },
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

const patientSchema = new Schema<PatientDocument>(
  {
    systemId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    searchName: { type: String, required: true, index: true },
    dateOfBirth: { type: String, required: true },
    sex: { type: String, enum: ['M', 'F', 'O'], required: true },
    contactNumber: { type: String },
    contactNumberHash: { type: String },
    address: { type: String },
    nationalId: { type: String },
    nationalIdHash: { type: String },
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

patientSchema.add(baseSchema);

// Dashboard aggregation: filter by clinic + date range, sorted by createdAt
patientSchema.index({ clinicId: 1, createdAt: -1 }, { name: 'clinicId_1_createdAt_-1' });
// #1069 — Patient list query: clinicId + isActive filter used with query hint
patientSchema.index({ clinicId: 1, isActive: 1 }, { name: 'clinicId_1_isActive_1' });
// #1434 — v2 keyset pagination: newest first with _id tie-breaker, so any page
// is a single index seek (no skip).
patientSchema.index(
  { clinicId: 1, isActive: 1, createdAt: -1, _id: -1 },
  { name: 'patients_clinicId_isActive_createdAt_id' }
);
patientSchema.index(
  { firstName: 'text', lastName: 'text', searchName: 'text', systemId: 'text' },
  {
    name: 'patients_text_search',
    weights: { searchName: 10, lastName: 5, firstName: 5, systemId: 3 },
  }
);
patientSchema.index(
  { clinicId: 1, isActive: 1, searchName: 1 },
  { name: 'patients_clinicId_isActive_searchName' }
);
patientSchema.index(
  { clinicId: 1, lastName: 1, firstName: 1 },
  { name: 'patients_clinicId_lastName_firstName' }
);
patientSchema.index(
  { clinicId: 1, riskLevel: 1, nextRiskReviewDate: 1 },
  { name: 'patients_clinicId_riskLevel_nextRiskReviewDate' }
);
// #1665 — Searchable blind indexes for encrypted PHI. Encrypted fields are
// never queried directly; equality lookups go through these hashes.
patientSchema.index(
  { clinicId: 1, nationalIdHash: 1 },
  { name: 'patients_clinicId_nationalIdHash', sparse: true }
);
patientSchema.index(
  { clinicId: 1, contactNumberHash: 1 },
  { name: 'patients_clinicId_contactNumberHash', sparse: true }
);

patientSchema.pre('save', function () {
  if (this.address) this.address = sanitizeText(this.address);
  const self = this as unknown as Record<string, unknown>;
  for (const field of PHI_FIELDS) {
    const val = this[field] as string | undefined;
    if (val) self[field] = encrypt(val);
  }
  // Blind indexes are computed from the plaintext before it is replaced.
  for (const [field, hashField] of Object.entries(PATIENT_BLIND_INDEX_FIELDS)) {
    const val = this[field as keyof PatientDocument] as string | undefined;
    self[hashField] = val ? blindIndex(val) : undefined;
  }
  // Encrypt PHI fields within each insurance entry
  if (this.insurance) {
    for (const ins of this.insurance) {
      const raw = ins as unknown as Record<string, unknown>;
      for (const field of INSURANCE_PHI_FIELDS) {
        const val = ins[field] as string | undefined;
        if (val) raw[field] = encrypt(val);
      }
      for (const [field, hashField] of Object.entries(INSURANCE_BLIND_INDEX_FIELDS)) {
        const val = raw[field] as string | undefined;
        raw[hashField] = val ? blindIndex(val) : undefined;
      }
    }
  }
});

function applyUpdateEncryption(target: Record<string, unknown>) {
  for (const field of PHI_FIELDS) {
    const val = target[field];
    if (typeof val === 'string') target[field] = encrypt(val);
  }
  for (const [field, hashField] of Object.entries(PATIENT_BLIND_INDEX_FIELDS)) {
    const val = target[field];
    if (typeof val === 'string') target[hashField] = blindIndex(val);
  }
}

patientSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) return;
  const target: Record<string, unknown> = (update.$set as Record<string, unknown>) ?? update;
  applyUpdateEncryption(target);
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

patientSchema.pre('updateMany', function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) return;
  const target: Record<string, unknown> = (update.$set as Record<string, unknown>) ?? update;
  applyUpdateEncryption(target);
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
  const age = this.get('age') as number | null | undefined;
  if (age == null) return null;
  if (age < 1) return 'infant';
  if (age < 3) return 'toddler';
  if (age < 12) return 'child';
  if (age < 18) return 'adolescent';
  if (age < 65) return 'adult';
  return 'elderly';
});

export const PatientModel = (models.Patient ||
  model<PatientDocument>('Patient', patientSchema)) as import('mongoose').Model<PatientDocument>;
