import { Schema, Types, model, models } from 'mongoose';

export type LoginAlertReason = 'NEW_DEVICE' | 'NEW_COUNTRY';

/**
 * A new-device / new-country sign-in alert (#1497). Holds the SHA-256 hash of the
 * single-use "This wasn't me" token that revokes every session for the user.
 */
export interface LoginAlert {
  userId: Types.ObjectId;
  knownDeviceId: Types.ObjectId;
  tokenHash: string;
  reasons: LoginAlertReason[];
  deviceLabel: string;
  country?: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

const loginAlertSchema = new Schema<LoginAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    knownDeviceId: { type: Schema.Types.ObjectId, ref: 'KnownDevice', required: true },
    tokenHash: { type: String, required: true, unique: true },
    reasons: { type: [String], enum: ['NEW_DEVICE', 'NEW_COUNTRY'], required: true },
    deviceLabel: { type: String, required: true },
    country: { type: String },
    createdAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { versionKey: false, collection: 'login_alerts' }
);

// TTL — the revoke link stops working (and the record is purged) once it expires
loginAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAlertModel = (models.LoginAlert ||
  model<LoginAlert>('LoginAlert', loginAlertSchema)) as import('mongoose').Model<LoginAlert>;
