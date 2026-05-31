import mongoose, { Document, Schema } from 'mongoose';

export interface IRefillRecord {
  refillDate: Date;
  dispensedQuantity: number;
  pharmacyNotes?: string;
}

export interface IMedicationHistory extends Document {
  patientId: mongoose.Types.ObjectId;
  encounterId: mongoose.Types.ObjectId;
  prescribingDoctorId: mongoose.Types.ObjectId;
  medicationName: string;
  dosage: string;
  frequency: string;
  startDate: Date;
  endDate?: Date;
  active: boolean;
  refillHistory: IRefillRecord[];
  interactionWarnings: string[];
}

const RefillRecordSchema = new Schema<IRefillRecord>({
  refillDate:         { type: Date, required: true },
  dispensedQuantity:  { type: Number, required: true },
  pharmacyNotes:      { type: String },
}, { _id: false });

const MedicationHistorySchema = new Schema<IMedicationHistory>(
  {
    patientId:           { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId:         { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    prescribingDoctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    medicationName:      { type: String, required: true },
    dosage:              { type: String, required: true },
    frequency:           { type: String, required: true },
    startDate:           { type: Date, required: true },
    endDate:             { type: Date },
    active:              { type: Boolean, default: true, index: true },
    refillHistory:       [RefillRecordSchema],
    interactionWarnings: [{ type: String }],
  },
  { timestamps: true },
);

MedicationHistorySchema.index({ patientId: 1, active: 1, startDate: -1 });

export const MedicationHistoryModel = mongoose.model<IMedicationHistory>(
  'MedicationHistory',
  MedicationHistorySchema,
);
