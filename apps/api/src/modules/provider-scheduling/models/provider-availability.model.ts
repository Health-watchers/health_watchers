import { Schema, Types, model, models } from 'mongoose';

/** A contiguous working window within a day, "HH:mm"–"HH:mm" (24h). */
export interface TimeBlock {
  start: string;
  end: string;
}

export interface DayHours {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  blocks: TimeBlock[];
}

export type OverrideType = 'off' | 'custom';

export interface AvailabilityOverride {
  date: string; // "YYYY-MM-DD"
  type: OverrideType;
  blocks?: TimeBlock[]; // required when type = 'custom'
  reason?: string;
}

export interface ProviderAvailability {
  providerId: Types.ObjectId;
  clinicId: Types.ObjectId;
  timezone: string; // IANA name; slot times are interpreted as wall-clock in this zone
  effectiveFrom: Date;
  effectiveTo?: Date;
  weeklyHours: DayHours[];
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxDailyAppointments?: number;
  overrides: AvailabilityOverride[];
  isActive: boolean;
  updatedBy?: Types.ObjectId;
}

const timeBlock = new Schema<TimeBlock>(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false }
);

const dayHours = new Schema<DayHours>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    blocks: { type: [timeBlock], default: [] },
  },
  { _id: false }
);

const overrideSchema = new Schema<AvailabilityOverride>(
  {
    date: { type: String, required: true },
    type: { type: String, enum: ['off', 'custom'], required: true },
    blocks: { type: [timeBlock], default: undefined },
    reason: { type: String },
  },
  { _id: false }
);

const schema = new Schema<ProviderAvailability>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    timezone: { type: String, default: 'UTC' },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date },
    weeklyHours: { type: [dayHours], default: [] },
    slotDurationMinutes: { type: Number, default: 30, min: 5 },
    bufferMinutes: { type: Number, default: 0, min: 0 },
    maxDailyAppointments: { type: Number, min: 0 },
    overrides: { type: [overrideSchema], default: [] },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// One active availability doc per provider per clinic.
schema.index({ providerId: 1, clinicId: 1 }, { unique: true });
schema.index({ clinicId: 1, isActive: 1 });

export const ProviderAvailabilityModel = (models.ProviderAvailability ||
  model<ProviderAvailability>(
    'ProviderAvailability',
    schema
  )) as import('mongoose').Model<ProviderAvailability>;
