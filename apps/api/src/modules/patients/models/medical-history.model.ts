import mongoose, { Schema, Document } from 'mongoose';

export interface SurgicalHistory {
  procedure: string;
  year: number;
  hospital?: string;
}

export interface FamilyHistory {
  condition: string;
  relationship: string;
}

export interface SocialHistory {
  smokingStatus: 'never' | 'former' | 'current';
  alcoholUse: 'none' | 'occasional' | 'moderate' | 'heavy';
  exerciseFrequency: 'none' | 'occasional' | 'regular';
  occupation?: string;
  maritalStatus?: string;
}

export interface CurrentMedication {
  name: string;
  dose: string;
  frequency: string;
  prescribedBy?: string;
}

export interface IMedicalHistory extends Document {
  patientId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  pastMedicalHistory: string[];
  surgicalHistory: SurgicalHistory[];
  familyHistory: FamilyHistory[];
  socialHistory: SocialHistory;
  currentMedications: CurrentMedication[];
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  lastUpdatedAt: Date;
}

const surgicalHistorySchema = new Schema<SurgicalHistory>(
  {
    procedure: { type: String, required: true },
    year: { type: Number, required: true },
    hospital: { type: String },
  },
  { _id: false }
);

const familyHistorySchema = new Schema<FamilyHistory>(
  {
    condition: { type: String, required: true },
    relationship: { type: String, required: true },
  },
  { _id: false }
);

const socialHistorySchema = new Schema<SocialHistory>(
  {
    smokingStatus: {
      type: String,
      enum: ['never', 'former', 'current'],
      required: true,
    },
    alcoholUse: {
      type: String,
      enum: ['none', 'occasional', 'moderate', 'heavy'],
      required: true,
    },
    exerciseFrequency: {
      type: String,
      enum: ['none', 'occasional', 'regular'],
      required: true,
    },
    occupation: { type: String },
    maritalStatus: { type: String },
  },
  { _id: false }
);

const currentMedicationSchema = new Schema<CurrentMedication>(
  {
    name: { type: String, required: true },
    dose: { type: String, required: true },
    frequency: { type: String, required: true },
    prescribedBy: { type: String },
  },
  { _id: false }
);

const medicalHistorySchema = new Schema<IMedicalHistory>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    pastMedicalHistory: { type: [String], default: [] },
    surgicalHistory: { type: [surgicalHistorySchema], default: [] },
    familyHistory: { type: [familyHistorySchema], default: [] },
    socialHistory: { type: socialHistorySchema, required: true },
    currentMedications: { type: [currentMedicationSchema], default: [] },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

// Index for clinic-scoped queries
medicalHistorySchema.index({ clinicId: 1, patientId: 1 });

export const MedicalHistoryModel =
  mongoose.models.MedicalHistory || mongoose.model<IMedicalHistory>('MedicalHistory', medicalHistorySchema);
