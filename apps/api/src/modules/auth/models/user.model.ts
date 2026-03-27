import bcrypt from 'bcryptjs';
import { Schema, Types, model, models } from 'mongoose';
import { AppRole } from '@api/types/express';
import { sanitizeText } from '@api/utils/sanitize';

const ROLES: AppRole[] = ['SUPER_ADMIN','CLINIC_ADMIN','DOCTOR','NURSE','ASSISTANT','READ_ONLY'];

export interface User {
  fullName: string; email: string; password: string;
  role: AppRole; clinicId: Types.ObjectId; isActive: boolean;
  mfaEnabled: boolean; mfaSecret?: string;
  resetPasswordTokenHash?: string; resetPasswordExpiresAt?: Date;
  failedLoginAttempts: number; lockedUntil?: Date;             // brute-force protection
}

const userSchema = new Schema({
  fullName:  { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ROLES, required: true },
  clinicId:  { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
  isActive:  { type: Boolean, default: true, index: true },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret:  { type: String, required: false, select: false, default: undefined },
  resetPasswordTokenHash: { type: String, required: false, select: false, default: undefined },
  resetPasswordExpiresAt: { type: Date,   required: false, select: false, default: undefined, index: true },
  failedLoginAttempts:    { type: Number, required: false, default: 0 },
  lockedUntil:            { type: Date,   required: false, default: undefined, index: true },
}, { timestamps: true, versionKey: false });

userSchema.pre('save', async function () {
  if (this.isModified('fullName')) this.fullName = sanitizeText(this.fullName);
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

export const UserModel = models.User || model('User', userSchema);