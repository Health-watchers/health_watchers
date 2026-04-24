import { Schema, model, models } from "mongoose";
import { sanitizeText } from "../../utils/sanitize";

export interface VitalSigns {
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
}

export interface Diagnosis {
  code: string;       // ICD-10 code
  description: string;
  isPrimary?: boolean;
}

export interface Prescription {
  drugName: string;          // Required
  genericName?: string;      // Optional
  dosage: string;            // e.g., '500mg'
  frequency: string;         // e.g., 'twice daily'
  duration: string;          // e.g., '7 days'
  route: 'oral' | 'topical' | 'injection' | 'inhaled' | 'other';
  instructions?: string;     // Special instructions
  prescribedBy: Schema.Types.ObjectId;  // userId of prescribing doctor
  prescribedAt: Date;
  refillsAllowed: number;    // Default 0
}

export interface Encounter {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  attendingDoctorId: Schema.Types.ObjectId;
  encounteredBy?: Schema.Types.ObjectId; // alias for attendingDoctorId (spec compat)
  chiefComplaint: string;
  status: "open" | "closed" | "follow-up" | "cancelled";
  notes?: string;
  diagnosis?: Diagnosis[];
  treatmentPlan?: string;
  vitalSigns?: VitalSigns;
  prescriptions?: Prescription[];
  followUpDate?: Date;
  aiSummary?: string;
  isActive?: boolean;
}

const vitalSignsSchema = new Schema<VitalSigns>(
  {
    bloodPressure:    { type: String },
    heartRate:        { type: Number },
    temperature:      { type: Number },
    respiratoryRate:  { type: Number },
    oxygenSaturation: { type: Number },
    weight:           { type: Number },
    height:           { type: Number },
  },
  { _id: false }
);

const diagnosisSchema = new Schema<Diagnosis>(
  {
    code:        { type: String, required: true },
    description: { type: String, required: true },
    isPrimary:   { type: Boolean, default: false },
  },
  { _id: false }
);

const prescriptionSchema = new Schema<Prescription>(
  {
    drugName:        { type: String, required: true },
    genericName:     { type: String },
    dosage:          { type: String, required: true },
    frequency:       { type: String, required: true },
    duration:        { type: String, required: true },
    route:           { type: String, enum: ['oral', 'topical', 'injection', 'inhaled', 'other'], required: true },
    instructions:    { type: String },
    prescribedBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prescribedAt:    { type: Date, default: Date.now },
    refillsAllowed:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

const encounterSchema = new Schema<Encounter>(
  {
    patientId:         { type: Schema.Types.ObjectId, ref: "Patient",  required: true, index: true },
    clinicId:          { type: Schema.Types.ObjectId, ref: "Clinic",   required: true, index: true },
    attendingDoctorId: { type: Schema.Types.ObjectId, ref: "User",     required: true, index: true },
    encounteredBy:     { type: Schema.Types.ObjectId, ref: "User" },
    chiefComplaint:    { type: String, required: true },
    status:            { type: String, enum: ["open", "closed", "follow-up", "cancelled"], default: "open", index: true },
    notes:             { type: String },
    treatmentPlan:     { type: String },
    diagnosis:         { type: [diagnosisSchema], default: undefined },
    vitalSigns:        { type: vitalSignsSchema },
    prescriptions:     { type: [prescriptionSchema], default: undefined },
    followUpDate:      { type: Date },
    aiSummary:         { type: String },
    isActive:          { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// Compound index for paginated clinic-scoped queries
encounterSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });

const FREE_TEXT_FIELDS = ["chiefComplaint", "notes", "treatmentPlan", "aiSummary"] as const;

encounterSchema.pre("save", function () {
  for (const field of FREE_TEXT_FIELDS) {
    const val = this[field];
    if (val) (this as any)[field] = sanitizeText(val);
  }
});

export const EncounterModel = models.Encounter || model<Encounter>("Encounter", encounterSchema);
