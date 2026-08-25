import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 * On first request, sets a non-HttpOnly `csrf-token` cookie.
 * On state-changing requests, validates that the X-CSRF-Token header matches the cookie.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Issue token if not present
  if (!req.cookies?.['csrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, {
      httpOnly: false, // must be readable by JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });
    // Store for this request so subsequent validation works on first request
    if (!req.cookies) (req as any).cookies = {};
    (req as any).cookies['csrf-token'] = token;
  }

  // Skip validation for safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip CSRF check for auth endpoints (login/register) since no session exists yet,
  // for CSP reports which are browser-generated with no user session, and for the
  // inbound Stellar payment webhook, which is a server-to-server call authenticated by
  // its own HMAC signature (X-Webhook-Signature) rather than a cookie session.
  if (
    req.path.startsWith('/api/v1/auth/login') ||
    req.path.startsWith('/api/v1/auth/register') ||
    req.path.startsWith('/api/v1/csp-report') ||
    req.path.startsWith('/api/v1/webhooks/stellar-payment')
  ) {
    return next();
  }

  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!cookieToken || !headerToken || !timingSafeEqualStrings(cookieToken, headerToken)) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'CSRF_TOKEN_INVALID',
      message: 'Invalid or missing CSRF token',
    });
    return;
  }

  next();
}

/**
 * Constant-time string comparison to avoid leaking the valid CSRF token via
 * response-timing side channels. Falls back to `false` on length mismatch
 * (crypto.timingSafeEqual requires equal-length buffers).
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
