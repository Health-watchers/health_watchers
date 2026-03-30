import { z } from 'zod';

// Top-1000 most common passwords (representative subset covering the most exploited)
const COMMON_PASSWORDS = new Set([
  'password','password1','password12','password123','password1234','password12345',
  'password123456','password1234567','password12345678','password123456789',
  'Password1!','Password1@','Password123!','Password123@',
  '123456','1234567','12345678','123456789','1234567890',
  'qwerty','qwerty123','qwerty1234','qwerty12345',
  'abc123','abc1234','abc12345',
  'iloveyou','letmein','monkey','dragon','master','sunshine','princess','welcome',
  'shadow','superman','michael','football','baseball','soccer','hockey','batman',
  'trustno1','hello123','admin123','root123','test1234','guest1234',
  'changeme','changeme1','changeme123','changeme1234',
  'healthcare','hospital','patient1','clinic123','doctor123','nurse123',
  'hipaa123','medical1','health123','wellness1',
]);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => /[A-Z]/.test(p), 'Password must contain at least one uppercase letter')
  .refine((p) => /[a-z]/.test(p), 'Password must contain at least one lowercase letter')
  .refine((p) => /[0-9]/.test(p), 'Password must contain at least one digit')
  .refine((p) => /[^A-Za-z0-9]/.test(p), 'Password must contain at least one special character')
  .refine((p) => !COMMON_PASSWORDS.has(p), 'Password is too common');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     passwordSchema,
  confirmPassword: z.string().min(1, 'Confirm password is required'),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  fullName: z.string().min(1),
  email:    z.string().email(),
  password: passwordSchema,
  role:     z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY']),
  clinicId: z.string().min(1),
});

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const mfaVerifySchema = z.object({
  totp: z.string().length(6),
});

export const mfaChallengeSchema = z.object({
  tempToken: z.string().min(1),
  totp:      z.string().length(6),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: passwordSchema,
});

export type LoginDto            = z.infer<typeof loginSchema>;
export type RegisterDto         = z.infer<typeof registerSchema>;
export type RefreshDto          = z.infer<typeof refreshSchema>;
export type MfaVerifyDto        = z.infer<typeof mfaVerifySchema>;
export type MfaChallengeDto     = z.infer<typeof mfaChallengeSchema>;
export type ForgotPasswordDto   = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto    = z.infer<typeof resetPasswordSchema>;
