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
  medication: string;
  dosage: string;
  frequency: string;
  duration?: string;
  notes?: string;
}

export interface Encounter {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  attendingDoctorId: Schema.Types.ObjectId;
  chiefComplaint: string;
  status: "open" | "closed" | "follow-up";
  notes?: string;
  diagnosis?: Diagnosis[];
  treatmentPlan?: string;
  vitalSigns?: VitalSigns;
  prescriptions?: Prescription[];
  followUpDate?: Date;
  aiSummary?: string;
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
    medication: { type: String, required: true },
    dosage:     { type: String, required: true },
    frequency:  { type: String, required: true },
    duration:   { type: String },
    notes:      { type: String },
  },
);

const encounterSchema = new Schema<Encounter>(
  {
    patientId:         { type: Schema.Types.ObjectId, ref: "Patient",  required: true, index: true },
    clinicId:          { type: Schema.Types.ObjectId, ref: "Clinic",   required: true, index: true },
    attendingDoctorId: { type: Schema.Types.ObjectId, ref: "User",     required: true, index: true },
    chiefComplaint:    { type: String, required: true },
    status:            { type: String, enum: ["open", "closed", "follow-up"], default: "open", index: true },
    notes:             { type: String },
    treatmentPlan:     { type: String },
    diagnosis:         { type: [diagnosisSchema], default: undefined },
    vitalSigns:        { type: vitalSignsSchema },
    prescriptions:     { type: [prescriptionSchema], default: undefined },
    followUpDate:      { type: Date },
    aiSummary:         { type: String },
  },
  { timestamps: true, versionKey: false }
);

const FREE_TEXT_FIELDS = ["chiefComplaint", "notes", "treatmentPlan", "aiSummary"] as const;

encounterSchema.pre("save", function () {
  for (const field of FREE_TEXT_FIELDS) {
    const val = this[field];
    if (val) (this as any)[field] = sanitizeText(val);
  }
});

export const EncounterModel = models.Encounter || model<Encounter>("Encounter", encounterSchema);
