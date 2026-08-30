import { Schema, model, models, Types } from 'mongoose';
import crypto from 'crypto';

export function generateApiKey(): string {
  return `hw_${crypto.randomBytes(32).toString('hex')}`;
}

/** Generate a key carrying an environment marker (`hw_live_…` / `hw_test_…`). */
export function generateApiKeyForEnv(env: ApiKeyEnvironment): string {
  return `hw_${env}_${crypto.randomBytes(32).toString('hex')}`;
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

export type ApiKeyEnvironment = 'live' | 'test';

/** #1252 — default rotation grace window: the superseded key keeps working
 *  for 24h so callers can roll the secret without downtime. */
export const DEFAULT_ROTATION_GRACE_HOURS = 24;
export const MAX_ROTATION_GRACE_HOURS = 24 * 7;

export interface IApiKey {
  clinicId: Types.ObjectId | string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: ApiKeyScope[];
  isActive: boolean;
  description?: string;
  environment: ApiKeyEnvironment;
  /** Free-form organisation labels (team, integration name, …). */
  tags: string[];
  /** Per-key request ceiling. 0 = inherit the global limiter only. */
  rateLimitPerMin: number;
  lastUsedAt?: Date;
  expiresAt?: Date;
  /** #1252 — set once the "key expiring soon" notification has gone out. */
  expiryWarningSentAt?: Date;
  /** #1252 — rotation: the previous secret stays valid until this instant. */
  previousKeyHash?: string;
  previousKeyExpiresAt?: Date;
  lastRotatedAt?: Date;
  rotationCount: number;
  /** #1252 — revocation is explicit and irreversible. */
  revokedAt?: Date;
  revokedReason?: string;
  revokedBy?: Types.ObjectId | string;
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
    description: { type: String, trim: true, maxlength: 500 },
    environment: { type: String, enum: ['live', 'test'], default: 'live', index: true },
    tags: { type: [String], default: [] },
    rateLimitPerMin: { type: Number, default: 0, min: 0, max: 100_000 },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, index: true },
    expiryWarningSentAt: { type: Date },
    previousKeyHash: { type: String, select: false },
    previousKeyExpiresAt: { type: Date },
    lastRotatedAt: { type: Date },
    rotationCount: { type: Number, default: 0 },
    revokedAt: { type: Date },
    revokedReason: { type: String, trim: true, maxlength: 500 },
    revokedBy: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

apiKeySchema.index({ clinicId: 1, isActive: 1 });
apiKeySchema.index({ previousKeyExpiresAt: 1 }, { sparse: true });

export const ApiKeyModel = (models.ApiKey ||
  model<IApiKey>('ApiKey', apiKeySchema)) as import('mongoose').Model<IApiKey>;
