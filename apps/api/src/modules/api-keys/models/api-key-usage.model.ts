import { Schema, model, models } from 'mongoose';

export interface IApiKeyUsage {
  apiKeyId: string;
  clinicId: string;
  date: string; // YYYY-MM-DD
  requestCount: number;
  lastEndpoint: string;
}

const apiKeyUsageSchema = new Schema<IApiKeyUsage>(
  {
    apiKeyId:      { type: String, required: true, index: true },
    clinicId:      { type: String, required: true },
    date:          { type: String, required: true }, // YYYY-MM-DD
    requestCount:  { type: Number, default: 0 },
    lastEndpoint:  { type: String, default: '' },
  },
  { timestamps: false, versionKey: false }
);

apiKeyUsageSchema.index({ apiKeyId: 1, date: 1 }, { unique: true });

export const ApiKeyUsageModel = models.ApiKeyUsage || model<IApiKeyUsage>('ApiKeyUsage', apiKeyUsageSchema);
