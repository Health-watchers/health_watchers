import { Schema, model, models } from 'mongoose';
import { sanitizeText, sanitizeHtml } from '../../utils/sanitize';

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
  code: string; // ICD-10 code
  description: string;
  isPrimary?: boolean;
}

export interface Prescription {
  drugName: string;
  genericName?: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'topical' | 'injection' | 'inhaled' | 'other';
  instructions?: string;
  prescribedBy: Schema.Types.ObjectId;
  prescribedAt: Date;
  refillsAllowed: number;
  allergyOverride?: { allergyId: string; reason: string };
}

export interface SoapNotes {
  subjective?: string;  // Patient's reported symptoms (rich HTML)
  objective?: string;   // Physical examination findings (rich HTML)
  assessment?: string;  // Doctor's clinical assessment (rich HTML)
  plan?: string;        // Treatment plan (rich HTML)
}

export interface CPTCode {
  code: string; // CPT code (e.g., "99213")
  description: string;
  units: number; // Number of times procedure was performed
  fee: string; // Fee in USD (stored as string to avoid floating point issues)
}

export interface BillingInfo {
  cptCodes: CPTCode[];
  billingStatus: 'unbilled' | 'billed' | 'paid' | 'denied';
  insuranceClaimId?: string; // External reference to insurance claim
  totalFee: string; // Total fee in USD
  billedAt?: Date;
  paidAt?: Date;
}

export interface Encounter {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  attendingDoctorId: Schema.Types.ObjectId;
  encounteredBy?: Schema.Types.ObjectId;
  type?: 'consultation' | 'telemedicine' | 'follow-up' | 'procedure';
  appointmentId?: Schema.Types.ObjectId;
  chiefComplaint: string;
  status: 'open' | 'closed' | 'follow-up' | 'cancelled' | 'pending_cosignature';
  notes?: string;
  soapNotes?: SoapNotes;
  diagnosis?: Diagnosis[];
  treatmentPlan?: string;
  vitalSigns?: VitalSigns;
  prescriptions?: Prescription[];
  followUpDate?: Date;
  aiSummary?: string;
  isActive?: boolean;
  billing?: BillingInfo;
}

const vitalSignsSchema = new Schema<VitalSigns>(
  {
    bloodPressure: { type: String },
    heartRate: { type: Number },
    temperature: { type: Number },
    respiratoryRate: { type: Number },
    oxygenSaturation: { type: Number },
    weight: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const diagnosisSchema = new Schema<Diagnosis>(
  {
    code: { type: String, required: true },
    description: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
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
    allergyOverride: {
      type: new Schema({ allergyId: String, reason: String }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true }
);

const soapNotesSchema = new Schema<SoapNotes>(
  {
    subjective: { type: String },
    objective:  { type: String },
    assessment: { type: String },
    plan:       { type: String },
  },
  { _id: false }
);

const cptCodeSchema = new Schema<CPTCode>(
  {
    code: { type: String, required: true },
    description: { type: String, required: true },
    units: { type: Number, required: true, min: 1, default: 1 },
    fee: { type: String, required: true },
  },
  { _id: false }
);

const billingInfoSchema = new Schema<BillingInfo>(
  {
    cptCodes: { type: [cptCodeSchema], default: [] },
    billingStatus: { 
      type: String, 
      enum: ['unbilled', 'billed', 'paid', 'denied'], 
      default: 'unbilled',
      index: true 
    },
    insuranceClaimId: { type: String },
    totalFee: { type: String, required: true, default: '0.00' },
    billedAt: { type: Date },
    paidAt: { type: Date },
  },
  { _id: false }
);

const encounterSchema = new Schema<Encounter>(
  {
    patientId:         { type: Schema.Types.ObjectId, ref: 'Patient',  required: true, index: true },
    clinicId:          { type: Schema.Types.ObjectId, ref: 'Clinic',   required: true, index: true },
    attendingDoctorId: { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    encounteredBy:     { type: Schema.Types.ObjectId, ref: 'User' },
    type:              { type: String, enum: ['consultation', 'telemedicine', 'follow-up', 'procedure'], default: 'consultation' },
    appointmentId:     { type: Schema.Types.ObjectId, ref: 'Appointment' },
    chiefComplaint:    { type: String, required: true },
    status:            { type: String, enum: ['open', 'closed', 'follow-up', 'cancelled', 'pending_cosignature'], default: 'open', index: true },
    notes:             { type: String },
    soapNotes:         { type: soapNotesSchema },
    treatmentPlan:     { type: String },
    diagnosis:         { type: [diagnosisSchema], default: undefined },
    vitalSigns:        { type: vitalSignsSchema },
    prescriptions:     { type: [prescriptionSchema], default: undefined },
    followUpDate:      { type: Date },
    aiSummary:         { type: String },
    isActive:          { type: Boolean, default: true, index: true },
    billing:           { type: billingInfoSchema },
  },
  { timestamps: true, versionKey: false }
);

// Compound index for paginated clinic-scoped queries
encounterSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
encounterSchema.index({ clinicId: 1, createdAt: -1 });           // List encounters for clinic
encounterSchema.index({ patientId: 1, createdAt: -1 });          // Patient encounter history
encounterSchema.index({ clinicId: 1, patientId: 1, status: 1 }); // Filter by status
encounterSchema.index({ encounteredBy: 1, createdAt: -1 });      // Doctor's encounters
// Compound index for search/filter performance (issue #394)
encounterSchema.index({ clinicId: 1, createdAt: -1, status: 1 });
// Targeted text index on searchable fields (replaces wildcard $** index)
encounterSchema.index({ chiefComplaint: 'text', notes: 'text' }, { name: 'encounter_text_search' });

const FREE_TEXT_FIELDS = ['chiefComplaint', 'notes', 'treatmentPlan', 'aiSummary'] as const;
const SOAP_FIELDS = ['subjective', 'objective', 'assessment', 'plan'] as const;

encounterSchema.pre('save', function () {
  for (const field of FREE_TEXT_FIELDS) {
    const val = this[field];
    if (val) (this as any)[field] = sanitizeText(val);
  }
  // Sanitize SOAP rich-text HTML fields (strip dangerous tags/attrs)
  if (this.soapNotes) {
    for (const field of SOAP_FIELDS) {
      const val = (this.soapNotes as any)[field];
      if (val) (this.soapNotes as any)[field] = sanitizeHtml(val);
    }
  }
});

export const EncounterModel = models.Encounter || model<Encounter>('Encounter', encounterSchema);
