import { Schema, Types, model, models } from 'mongoose';

/**
 * Tracks recently-used ICD-10 codes per clinic. One document per (clinic, code);
 * `useCount` and `lastUsedAt` are bumped each time the code is used so the
 * "recent codes" list can be ordered by recency.
 */
export interface IClinicICD10Recent {
  clinicId: Types.ObjectId;
  code: string;
  description: string;
  useCount: number;
  lastUsedAt: Date;
}

const clinicICD10RecentSchema = new Schema<IClinicICD10Recent>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    useCount: { type: Number, default: 1 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

// One record per clinic+code; recency lookups are scoped by clinic.
clinicICD10RecentSchema.index({ clinicId: 1, code: 1 }, { unique: true });
clinicICD10RecentSchema.index({ clinicId: 1, lastUsedAt: -1 });

export const ClinicICD10RecentModel =
  models.ClinicICD10Recent ||
  model<IClinicICD10Recent>('ClinicICD10Recent', clinicICD10RecentSchema);
