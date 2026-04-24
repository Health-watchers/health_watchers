import bcrypt from 'bcryptjs';
import { Schema, Types, model, models } from 'mongoose';
import { AppRole } from '@api/types/express';

const ROLES: AppRole[] = [
  'SUPER_ADMIN',
  'CLINIC_ADMIN',
  'DOCTOR',
  'NURSE',
  'ASSISTANT',
  'READ_ONLY',
  'PATIENT',
];

export interface UserPreferences {
  language: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notificationTypes: {
    referral_received: boolean;
    payment_confirmed: boolean;
    appointment_reminder: boolean;
    ai_summary_ready: boolean;
    lab_result_ready: boolean;
    system: boolean;
  };
}

export interface User {
  fullName: string;
  email: string;
  password: string;
  role: AppRole;
  clinicId: Types.ObjectId;
  patientId?: Types.ObjectId; // set when role === 'PATIENT'
  isActive: boolean;
  emailVerified: boolean;
  emailVerificationTokenHash?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[]; // hashed backup codes
  resetPasswordTokenHash?: string;
  resetPasswordExpiresAt?: Date;
  failedLoginAttempts: number;
  failedMfaAttempts: number;
  lockedUntil?: Date; // brute-force protection
  preferences: UserPreferences;
}

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', default: undefined },
    isActive: { type: Boolean, default: true, index: true },
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: {
      type: String,
      required: false,
      select: false,
      default: undefined,
    },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: {
      type: String,
      required: false,
      select: false,
      default: undefined,
    },
    mfaBackupCodes: {
      type: [String],
      required: false,
      select: false,
      default: undefined,
    },
    resetPasswordTokenHash: {
      type: String,
      required: false,
      select: false,
      default: undefined,
    },
    resetPasswordExpiresAt: {
      type: Date,
      required: false,
      select: false,
      default: undefined,
      index: true,
    },
    failedLoginAttempts: { type: Number, required: false, default: 0 },
    failedMfaAttempts: { type: Number, required: false, default: 0 },
    lockedUntil: {
      type: Date,
      required: false,
      default: undefined,
      index: true,
    },
    preferences: {
      language: { type: String, default: 'en' },
      emailNotifications: { type: Boolean, default: true },
      inAppNotifications: { type: Boolean, default: true },
      notificationTypes: {
        referral_received:    { type: Boolean, default: true },
        payment_confirmed:    { type: Boolean, default: true },
        appointment_reminder: { type: Boolean, default: true },
        ai_summary_ready:     { type: Boolean, default: true },
        lab_result_ready:     { type: Boolean, default: true },
        system:               { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true, versionKey: false }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

export const UserModel = models.User || model('User', userSchema);
