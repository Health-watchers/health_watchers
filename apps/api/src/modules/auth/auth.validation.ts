import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email('Email must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
export const mfaVerifySchema = z.object({
  totp: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d+$/, 'TOTP must be numeric'),
});
export const mfaChallengeSchema = z.object({
  tempToken: z.string().min(1, 'Temp token is required'),
  totp:      z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d+$/, 'TOTP must be numeric'),
});

export type LoginDto        = z.infer<typeof loginSchema>;
export type RefreshDto      = z.infer<typeof refreshSchema>;
export type MfaVerifyDto    = z.infer<typeof mfaVerifySchema>;
export type MfaChallengeDto = z.infer<typeof mfaChallengeSchema>;
