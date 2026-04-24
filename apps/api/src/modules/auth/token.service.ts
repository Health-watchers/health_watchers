import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '@health-watchers/config';

export interface TokenPayload {
  userId: string;
  role: string;
  clinicId: string;
  patientId?: string;
}

interface JwtPayload extends TokenPayload {
  iss: string;
  aud: string;
  jti?: string;
  family?: string;
}

const JWT_ISSUER = config.jwt.issuer;
const JWT_AUDIENCE = config.jwt.audience;
const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const TEMP_TOKEN_EXPIRY = '5m';

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.accessTokenSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export interface RefreshTokenMeta {
  token: string;
  jti: string;
  family: string;
}

export function signRefreshToken(payload: TokenPayload, family?: string): RefreshTokenMeta {
  const jti = crypto.randomUUID();
  const tokenFamily = family ?? crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti, family: tokenFamily }, config.jwt.refreshTokenSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return { token, jti, family: tokenFamily };
}

export function signTempToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.accessTokenSecret, {
    expiresIn: TEMP_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    return {
      userId: decoded.userId,
      role: decoded.role,
      clinicId: decoded.clinicId,
      patientId: decoded.patientId,
    };
  } catch (error) {
    return null;
  }
}

export interface RefreshTokenPayload extends TokenPayload {
  jti: string;
  family: string;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    if (!decoded.jti || !decoded.family) return null;
    return {
      userId: decoded.userId,
      role: decoded.role,
      clinicId: decoded.clinicId,
      jti: decoded.jti,
      family: decoded.family,
    };
  } catch (error) {
    return null;
  }
}

export function verifyTempToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { userId: string };
    return decoded.userId;
  } catch (error) {
    return null;
  }
}
