import { Schema, Types, model, models } from 'mongoose';

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const dayScheduleSchema = new Schema(
  {
    open: { type: String, default: '08:00' },
    close: { type: String, default: '17:00' },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false }
);

const defaultWorkingHours = () =>
  Object.fromEntries(
    DAYS.map((d) => [
      d,
      { open: '08:00', close: '17:00', isOpen: d !== 'saturday' && d !== 'sunday' },
    ])
  );

export interface IClinicSettings {
  clinicId: Types.ObjectId;
  workingHours: Record<string, { open: string; close: string; isOpen: boolean }>;
  appointmentDuration: number;
  timezone: string;
  currency: 'XLM' | 'USDC';
  stellarPublicKey?: string;
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    appointmentReminders: boolean;
    reminderHoursBefore: number;
  };
  branding: {
    clinicName: string;
    logoUrl?: string;
    primaryColor?: string;
  };
}

const clinicSettingsSchema = new Schema<IClinicSettings>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      unique: true,
      index: true,
    },
    workingHours: { type: Schema.Types.Mixed, default: defaultWorkingHours },
    appointmentDuration: { type: Number, default: 30, min: 5, max: 240 },
    timezone: { type: String, default: 'UTC' },
    currency: { type: String, enum: ['XLM', 'USDC'], default: 'XLM' },
    stellarPublicKey: { type: String },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      appointmentReminders: { type: Boolean, default: true },
      reminderHoursBefore: { type: Number, default: 24 },
    },
    branding: {
      clinicName: { type: String, default: '' },
      logoUrl: { type: String },
      primaryColor: { type: String },
    },
  },
  { timestamps: true, versionKey: false }
);

export const ClinicSettingsModel =
  models.ClinicSettings || model<IClinicSettings>('ClinicSettings', clinicSettingsSchema);
