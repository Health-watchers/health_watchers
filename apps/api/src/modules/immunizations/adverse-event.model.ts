import mongoose, { Schema, Document, Types } from 'mongoose';

export type AdverseEventSeverity = 'mild' | 'moderate' | 'severe' | 'life-threatening';
export type AdverseEventOutcome = 'recovered' | 'recovering' | 'ongoing' | 'fatal' | 'unknown';

export interface IVaccineAdverseEvent extends Document {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  immunizationId?: Types.ObjectId;
  vaccineCode: string;
  vaccineName: string;
  lotNumber?: string;
  description: string;
  severity: AdverseEventSeverity;
  onsetDate: Date;
  resolvedDate?: Date;
  outcome: AdverseEventOutcome;
  reportedToVAERS: boolean;
  vaersReportId?: string;
  reportedDate?: Date;
  reportedBy: string;
  notes?: string;
}

const VaccineAdverseEventSchema = new Schema<IVaccineAdverseEvent>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    immunizationId: { type: Schema.Types.ObjectId, ref: 'Immunization' },
    vaccineCode: { type: String, required: true, trim: true, index: true },
    vaccineName: { type: String, required: true, trim: true },
    lotNumber: { type: String, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'life-threatening'],
      required: true,
    },
    onsetDate: { type: Date, required: true },
    resolvedDate: { type: Date },
    outcome: {
      type: String,
      enum: ['recovered', 'recovering', 'ongoing', 'fatal', 'unknown'],
      default: 'unknown',
    },
    reportedToVAERS: { type: Boolean, default: false },
    vaersReportId: { type: String },
    reportedDate: { type: Date },
    reportedBy: { type: String, required: true },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false }
);

VaccineAdverseEventSchema.index({ clinicId: 1, createdAt: -1 });
VaccineAdverseEventSchema.index({ patientId: 1, createdAt: -1 });
VaccineAdverseEventSchema.index({ severity: 1, createdAt: -1 });

export const VaccineAdverseEventModel = (mongoose.models.VaccineAdverseEvent ||
  mongoose.model<IVaccineAdverseEvent>(
    'VaccineAdverseEvent',
    VaccineAdverseEventSchema
  )) as import('mongoose').Model<IVaccineAdverseEvent>;
