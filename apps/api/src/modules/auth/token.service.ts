import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '@health-watchers/config';
import { isDenylisted, isInvalidatedForUser } from '@api/services/token-denylist.service';

export interface TokenPayload {
  userId: string;
  role: string;
  clinicId: string;
  patientId?: string;
  /** True for platform administrators; preserved across clinic switches so a
   *  SUPER_ADMIN scoped to a clinic is still recognised as a super admin. */
  isSuperAdmin?: boolean;
}

export interface AccessTokenPayload extends TokenPayload {
  jti: string;
  iat: number;
  exp: number;
}

interface JwtPayload extends TokenPayload {
  iss: string;
  aud: string;
  jti?: string;
  family?: string;
  iat?: number;
  exp?: number;
}

const JWT_ISSUER = config.jwt.issuer;
const JWT_AUDIENCE = config.jwt.audience;
const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const TEMP_TOKEN_EXPIRY = '5m';

export function signAccessToken(payload: TokenPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, config.jwt.accessTokenSecret, {
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
  return jwt.sign({ userId }, config.jwt.tempTokenSecret, {
    expiresIn: TEMP_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Synchronous verify — does NOT check the denylist.
 * Use only where async is not possible (e.g. socket auth).
 * Prefer verifyAccessTokenAsync for HTTP request handlers.
 */
export function verifyAccessToken(token: string): (TokenPayload & { jti?: string }) | null {
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
      isSuperAdmin: decoded.isSuperAdmin,
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
}

/**
 * Async verify — checks signature AND the Redis denylist.
 * Use this in the authenticate middleware.
 */
export async function verifyAccessTokenAsync(
  token: string,
): Promise<(TokenPayload & { jti?: string }) | null> {
  const payload = verifyAccessToken(token);
  if (!payload) return null;

  if (payload.jti) {
    if (await isDenylisted(payload.jti)) return null;
    if (
      await isInvalidatedForUser(
        payload.userId,
        (jwt.decode(token) as JwtPayload)?.iat ?? 0,
      )
    )
      return null;
  }

  return payload;
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
  } catch {
    return null;
  }
}

export function verifyTempToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.jwt.tempTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}
