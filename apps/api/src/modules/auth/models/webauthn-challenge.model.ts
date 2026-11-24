import { Schema, model, models } from 'mongoose';

export type WebAuthnCeremony = 'registration' | 'authentication';

export interface WebAuthnChallenge {
  /** Opaque ID handed to the client so it can reference the challenge on verify */
  challengeId: string;
  challenge: string;
  ceremony: WebAuthnCeremony;
  /** Set for registration and second-factor authentication; absent for usernameless login */
  userId?: string;
  expiresAt: Date;
}

const webAuthnChallengeSchema = new Schema<WebAuthnChallenge>(
  {
    challengeId: { type: String, required: true, unique: true, index: true },
    challenge: { type: String, required: true },
    ceremony: { type: String, enum: ['registration', 'authentication'], required: true },
    userId: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

// TTL index — MongoDB auto-removes expired challenges
webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WebAuthnChallengeModel = (models.WebAuthnChallenge ||
  model<WebAuthnChallenge>(
    'WebAuthnChallenge',
    webAuthnChallengeSchema
  )) as import('mongoose').Model<WebAuthnChallenge>;
