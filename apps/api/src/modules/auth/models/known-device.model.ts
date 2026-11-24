import { Schema, Types, model, models } from 'mongoose';

/**
 * A device (browser/OS fingerprint) a user has signed in from, with the coarse
 * locations (ISO country codes) seen for it (#1497). Raw IP addresses are never stored.
 */
export interface KnownDevice {
  userId: Types.ObjectId;
  fingerprint: string;
  deviceLabel: string;
  userAgent?: string;
  countries: string[];
  lastCountry?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const knownDeviceSchema = new Schema<KnownDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fingerprint: { type: String, required: true },
    deviceLabel: { type: String, required: true },
    userAgent: { type: String, maxlength: 512 },
    countries: { type: [String], default: [] },
    lastCountry: { type: String },
    firstSeenAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, collection: 'known_devices' }
);

knownDeviceSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });

export const KnownDeviceModel = (models.KnownDevice ||
  model<KnownDevice>('KnownDevice', knownDeviceSchema)) as import('mongoose').Model<KnownDevice>;
