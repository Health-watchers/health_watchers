import { Schema, Types, model, models } from 'mongoose';

export interface IConsentForm {
  clinicId: Types.ObjectId;
  type: string; // matches ConsentType
  version: string; // semver string e.g. "2.0"
  content: string;
  effectiveDate: Date;
  createdBy: Types.ObjectId;
}

const consentFormSchema = new Schema<IConsentForm>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    type: { type: String, required: true },
    version: { type: String, required: true },
    content: { type: String, required: true },
    effectiveDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

// Each clinic can have one active version per consent type
consentFormSchema.index({ clinicId: 1, type: 1, version: 1 }, { unique: true });
// Fast lookup for the latest version per clinic+type
consentFormSchema.index({ clinicId: 1, type: 1, effectiveDate: -1 });

export const ConsentFormModel =
  models.ConsentForm || model<IConsentForm>('ConsentForm', consentFormSchema);
