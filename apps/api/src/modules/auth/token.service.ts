import jwt from 'jsonwebtoken';
import { config } from '@health-watchers/config';

export interface TokenPayload {
  userId: string;
  role: string;
  clinicId: string;
}

interface JwtPayload extends TokenPayload {
  iss: string;
  aud: string;
}

const JWT_ISSUER = config.jwt.issuer;
const JWT_AUDIENCE = config.jwt.audience;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const TEMP_TOKEN_EXPIRY = '5m';

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    payload,
    config.jwt.accessTokenSecret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(
    payload,
    config.jwt.refreshTokenSecret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function signTempToken(userId: string): string {
  return jwt.sign(
    { userId },
    config.jwt.accessTokenSecret,
    {
      expiresIn: TEMP_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
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
    };
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    return {
      userId: decoded.userId,
      role: decoded.role,
      clinicId: decoded.clinicId,
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
