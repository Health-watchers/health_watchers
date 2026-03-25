import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '@health-watchers/config';
import { AppRole, AuthenticatedUser } from '@api/types/express';

export interface TokenUser { userId: string; role: AppRole; clinicId: string; }

const aSecret = config.jwt.accessTokenSecret;
const rSecret = config.jwt.refreshTokenSecret;
if (!aSecret || !rSecret) throw new Error('JWT secrets are required');

const isObj = (p: string | JwtPayload): p is JwtPayload => typeof p !== 'string';

export const signAccessToken  = (u: TokenUser) =>
  jwt.sign({ ...u, tokenType: 'access'  }, aSecret, { expiresIn: '15m' });
export const signRefreshToken = (u: TokenUser) =>
  jwt.sign({ ...u, tokenType: 'refresh' }, rSecret, { expiresIn: '7d'  });

/** Short-lived token issued after password check when MFA is required (5 min TTL). */
export const signTempToken = (userId: string) =>
  jwt.sign({ userId, tokenType: 'mfa_pending' }, aSecret, { expiresIn: '5m' });

export const verifyTempToken = (token: string): string | null => {
  try {
    const d = jwt.verify(token, aSecret);
    if (!isObj(d) || d.tokenType !== 'mfa_pending' || typeof d.userId !== 'string') return null;
    return d.userId;
  } catch { return null; }
};

export const verifyAccessToken = (token: string): AuthenticatedUser | null => {
  try {
    const d = jwt.verify(token, aSecret);
    if (!isObj(d) || d.tokenType !== 'access' || typeof d.userId !== 'string' || typeof d.role !== 'string' || typeof d.clinicId !== 'string') return null;
    return { userId: d.userId, role: d.role as AppRole, clinicId: d.clinicId };
  } catch { return null; }
};
export const verifyRefreshToken = (token: string): TokenUser | null => {
  try {
    const d = jwt.verify(token, rSecret);
    if (!isObj(d) || d.tokenType !== 'refresh' || typeof d.userId !== 'string' || typeof d.role !== 'string' || typeof d.clinicId !== 'string') return null;
    return { userId: d.userId, role: d.role as AppRole, clinicId: d.clinicId };
  } catch { return null; }
};
