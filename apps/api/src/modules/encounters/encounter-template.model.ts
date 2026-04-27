import { Schema, Types, model, models } from 'mongoose';

export interface IEncounterTemplate {
  clinicId: Types.ObjectId;
  name: string;
  description?: string;
  category: string;
  defaultChiefComplaint?: string;
  defaultVitalSigns?: Record<string, unknown>;
  suggestedDiagnoses?: { code: string; description: string }[];
  suggestedTests?: string[];
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  usageCount: number;
}

const encounterTemplateSchema = new Schema<IEncounterTemplate>(
  {
    clinicId:             { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    name:                 { type: String, required: true, trim: true },
    description:          { type: String },
    category:             { type: String, required: true, trim: true },
    defaultChiefComplaint:{ type: String },
    defaultVitalSigns:    { type: Schema.Types.Mixed },
    suggestedDiagnoses:   [{ code: String, description: String, _id: false }],
    suggestedTests:       [{ type: String }],
    notes:                { type: String },
    isActive:             { type: Boolean, default: true, index: true },
    createdBy:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usageCount:           { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const EncounterTemplateModel =
  models.EncounterTemplate || model<IEncounterTemplate>('EncounterTemplate', encounterTemplateSchema);
