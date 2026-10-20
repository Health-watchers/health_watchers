import { Request, Response, NextFunction } from 'express';
import { validateAccessTokenClaims } from '../modules/auth/jwt-claim-validator';
import { isDenylisted, isInvalidatedForUser } from '../services/token-denylist.service';
import jwt from 'jsonwebtoken';
import { AppRole } from '../types/express';
import { ApiErrorCode } from '@health-watchers/types';
import { sendApiError } from '../utils/api-response';

/**
 * authenticate — Express middleware that enforces full JWT claim validation.
 *
 * Validation order (matching jwt-claim-validator.ts):
 *   1. Bearer token present
 *   2. iss, aud, exp, jti claims — explicit per-claim check
 *   3. Signature verification
 *   4. Denylist / per-user invalidation check
 *
 * Closes #1037 — JWT Token Validation Enhancement
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendApiError(
      res,
      401,
      'Unauthorized',
      ApiErrorCode.UNAUTHORIZED,
      'Missing or invalid Authorization header'
    );
    return;
  }

  const token = authHeader.slice(7);

  // Validate all JWT claims explicitly (iss, aud, exp, jti, signature)
  const result = validateAccessTokenClaims(token);
  if (!result.valid || !result.payload) {
    const messageMap: Record<string, string> = {
      MISSING_ISSUER: 'Token is missing issuer claim',
      INVALID_ISSUER: 'Token issuer is not trusted',
      MISSING_AUDIENCE: 'Token is missing audience claim',
      INVALID_AUDIENCE: 'Token audience is not accepted',
      MISSING_EXPIRY: 'Token does not have an expiry claim',
      TOKEN_EXPIRED: 'Token has expired',
      MISSING_JTI: 'Token is missing a unique identifier (jti)',
      INVALID_SIGNATURE: 'Token signature verification failed',
      MALFORMED_TOKEN: 'Token is malformed',
    };
    sendApiError(
      res,
      401,
      'Unauthorized',
      ApiErrorCode.INVALID_TOKEN,
      messageMap[result.error ?? ''] ?? 'Invalid token'
    );
    return;
  }

  const payload = result.payload;

  // Denylist check — token-level (logout / compromised token)
  if (payload.jti) {
    if (await isDenylisted(payload.jti)) {
      sendApiError(res, 401, 'Unauthorized', ApiErrorCode.INVALID_TOKEN, 'Token has been revoked');
      return;
    }
  }

  // Per-user invalidation check (e.g. password change invalidates all prior tokens)
  const iat = payload.iat ?? (jwt.decode(token) as jwt.JwtPayload)?.iat ?? 0;
  if (payload.userId && (await isInvalidatedForUser(payload.userId as string, iat))) {
    sendApiError(
      res,
      401,
      'Unauthorized',
      ApiErrorCode.INVALID_TOKEN,
      'Token has been invalidated — please log in again'
    );
    return;
  }

  req.user = {
    userId: payload.userId as string,
    role: payload.role as AppRole,
    clinicId: payload.clinicId as string,
    patientId: payload.patientId as string | undefined,
    isSuperAdmin: (payload.isSuperAdmin as boolean | undefined) ?? payload.role === 'SUPER_ADMIN',
  };
  req.tokenJti = payload.jti;
  return next();
}

export function requireRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendApiError(res, 403, 'Forbidden', ApiErrorCode.FORBIDDEN, 'Insufficient permissions');
      return;
    }
    return next();
  };
}
