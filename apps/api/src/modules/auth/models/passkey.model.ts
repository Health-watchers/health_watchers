import { Schema, Types, model, models } from 'mongoose';

export type PasskeyTransport =
  | 'ble'
  | 'cable'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'smart-card'
  | 'usb';

export interface Passkey {
  userId: Types.ObjectId;
  /** Base64URL credential ID returned by the authenticator */
  credentialId: string;
  /** Base64URL-encoded COSE public key */
  publicKey: string;
  counter: number;
  transports: PasskeyTransport[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  name: string;
  lastUsedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const passkeySchema = new Schema<Passkey>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    credentialId: { type: String, required: true, unique: true, index: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
    deviceType: { type: String, enum: ['singleDevice', 'multiDevice'], required: true },
    backedUp: { type: Boolean, default: false },
    name: { type: String, required: true, trim: true, maxlength: 64 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

export const PasskeyModel = (models.Passkey ||
  model<Passkey>('Passkey', passkeySchema)) as import('mongoose').Model<Passkey>;
