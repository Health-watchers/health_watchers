import { Schema, model, models } from 'mongoose';

export interface RefreshToken {
  jti: string;
  userId: string;
  family: string;
  consumed: boolean;
  expiresAt: Date;
}

const refreshTokenSchema = new Schema<RefreshToken>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    family: { type: String, required: true, index: true },
    consumed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

// TTL index — MongoDB auto-removes expired documents
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel =
  models.RefreshToken || model<RefreshToken>('RefreshToken', refreshTokenSchema);
