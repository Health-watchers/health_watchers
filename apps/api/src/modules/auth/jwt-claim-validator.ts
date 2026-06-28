import jwt from 'jsonwebtoken';
import { config } from '@health-watchers/config';

export type JwtClaimError =
  | 'MISSING_ISSUER'
  | 'INVALID_ISSUER'
  | 'MISSING_AUDIENCE'
  | 'INVALID_AUDIENCE'
  | 'TOKEN_EXPIRED'
  | 'MISSING_EXPIRY'
  | 'INVALID_SIGNATURE'
  | 'MALFORMED_TOKEN'
  | 'MISSING_JTI';

export interface JwtValidationResult {
  valid: boolean;
  error?: JwtClaimError;
  payload?: jwt.JwtPayload;
}

/**
 * Validates all required JWT claims explicitly.
 * Checks iss, aud, exp, and signature independently
 * so failures can be diagnosed with a specific error code.
 */
export function validateJwtClaims(
  token: string,
  secret: string,
  expectedIssuer: string,
  expectedAudience: string
): JwtValidationResult {
  // First decode without verification to inspect claims before signature check
  let decoded: jwt.Jwt | null;
  try {
    decoded = jwt.decode(token, { complete: true });
  } catch {
    return { valid: false, error: 'MALFORMED_TOKEN' };
  }

  if (!decoded || typeof decoded.payload === 'string') {
    return { valid: false, error: 'MALFORMED_TOKEN' };
  }

  const payload = decoded.payload as jwt.JwtPayload;

  // Validate issuer claim
  if (!payload.iss) {
    return { valid: false, error: 'MISSING_ISSUER' };
  }
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'INVALID_ISSUER' };
  }

  // Validate audience claim
  const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (aud.length === 0) {
    return { valid: false, error: 'MISSING_AUDIENCE' };
  }
  if (!aud.includes(expectedAudience)) {
    return { valid: false, error: 'INVALID_AUDIENCE' };
  }

  // Validate expiry claim presence
  if (payload.exp === undefined || payload.exp === null) {
    return { valid: false, error: 'MISSING_EXPIRY' };
  }

  // Validate expiry (exp)
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  // Verify signature (this also re-checks iss, aud, exp via the library)
  try {
    const verified = jwt.verify(token, secret, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    }) as jwt.JwtPayload;
    return { valid: true, payload: verified };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { valid: false, error: 'TOKEN_EXPIRED' };
    }
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }
}

/**
 * Validates an access token using the configured issuer and audience.
 */
export function validateAccessTokenClaims(token: string): JwtValidationResult {
  return validateJwtClaims(
    token,
    config.jwt.accessTokenSecret,
    config.jwt.issuer,
    config.jwt.audience
  );
}

/**
 * Validates a refresh token using the configured issuer and audience.
 */
export function validateRefreshTokenClaims(token: string): JwtValidationResult {
  return validateJwtClaims(
    token,
    config.jwt.refreshTokenSecret,
    config.jwt.issuer,
    config.jwt.audience
  );
}
