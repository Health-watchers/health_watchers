import { Schema, model, models } from 'mongoose';

export interface LabResultEntry {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag?: 'H' | 'L' | 'HH' | 'LL' | 'N';
}

export interface ILabResult {
  patientId: Schema.Types.ObjectId;
  encounterId?: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  orderedBy: Schema.Types.ObjectId;
  testName: string;
  testCode?: string;
  status: 'ordered' | 'pending' | 'resulted' | 'cancelled';
  orderedAt: Date;
  resultedAt?: Date;
  results?: LabResultEntry[];
  notes?: string;
  attachmentUrl?: string;
}

const labResultEntrySchema = new Schema<LabResultEntry>(
  {
    parameter:      { type: String, required: true },
    value:          { type: String, required: true },
    unit:           { type: String, required: true },
    referenceRange: { type: String, required: true },
    flag:           { type: String, enum: ['H', 'L', 'HH', 'LL', 'N'] },
  },
  { _id: false },
);

const labResultSchema = new Schema<ILabResult>(
  {
    patientId:     { type: Schema.Types.ObjectId, ref: 'Patient',   required: true, index: true },
    encounterId:   { type: Schema.Types.ObjectId, ref: 'Encounter', index: true },
    clinicId:      { type: Schema.Types.ObjectId, ref: 'Clinic',    required: true, index: true },
    orderedBy:     { type: Schema.Types.ObjectId, ref: 'User',      required: true },
    testName:      { type: String, required: true },
    testCode:      { type: String },
    status:        { type: String, enum: ['ordered', 'pending', 'resulted', 'cancelled'], default: 'ordered', index: true },
    orderedAt:     { type: Date, default: Date.now },
    resultedAt:    { type: Date },
    results:       { type: [labResultEntrySchema], default: undefined },
    notes:         { type: String },
    attachmentUrl: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export const LabResultModel = models.LabResult || model<ILabResult>('LabResult', labResultSchema);
