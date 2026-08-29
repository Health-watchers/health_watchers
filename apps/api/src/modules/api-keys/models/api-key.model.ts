import { Schema, model, models, Types } from 'mongoose';
import crypto from 'crypto';

export function generateApiKey(): string {
  return `hw_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

export type ApiKeyScope =
  | 'patients:read'
  | 'patients:write'
  | 'encounters:read'
  | 'encounters:write'
  | 'payments:read'
  | 'payments:write'
  | 'lab-results:write';

export const ALL_SCOPES: ApiKeyScope[] = [
  'patients:read',
  'patients:write',
  'encounters:read',
  'encounters:write',
  'payments:read',
  'payments:write',
  'lab-results:write',
];

export interface IApiKey {
  clinicId: Types.ObjectId | string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: ApiKeyScope[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdBy: Types.ObjectId | string;
  userId?: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    clinicId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    prefix: { type: String, required: true },
    scopes: { type: [String], enum: ALL_SCOPES, default: [] },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

export const ApiKeyModel = (models.ApiKey ||
  model<IApiKey>('ApiKey', apiKeySchema)) as import('mongoose').Model<IApiKey>;
