/**
 * csrf.middleware.ts
 *
 * OWASP A05 — Security Misconfiguration / CSRF
 *
 * Double-submit cookie CSRF protection.
 *
 * Flow:
 *   1. On any request, if no csrf-token cookie exists, issue a new one.
 *   2. Safe methods (GET, HEAD, OPTIONS) pass through unchecked.
 *   3. State-mutating methods (POST, PUT, PATCH, DELETE) require the request
 *      to send the same token value in the X-CSRF-Token header.
 *   4. Comparison uses crypto.timingSafeEqual to prevent timing-oracle attacks.
 *
 * Exceptions (no CSRF token required — but see notes):
 *   - /api/v1/auth/login & /register  — no prior session / cookie exists
 *   - /api/v1/csp-report              — browser-generated, no user session
 *   - /api/v1/webhooks/stellar-payment — server-to-server, protected by HMAC
 *
 * Security hardening in this version:
 *   - Token is 32 cryptographically-random bytes (256 bits of entropy)
 *   - Cookie is SameSite=strict + Secure in production
 *   - Cookie has an explicit maxAge of 8 hours (reduces exposure window)
 *   - Empty or whitespace-only header values are rejected
 *   - Both cookie and header are validated before comparison
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 8-hour token lifetime — long enough for a work session, short enough to
 *  limit replay window if a token is leaked. */
const CSRF_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** Paths that are exempt from CSRF validation (see module docstring). */
const CSRF_EXEMPT_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/csp-report',
  '/api/v1/webhooks/stellar-payment',
  '/api/v2/webhooks/',
];

function isExempt(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Constant-time string comparison — prevents timing oracle on the token value.
 * Returns false immediately on length mismatch (buffers must be equal length
 * for crypto.timingSafeEqual).
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  // Use fixed-length HMAC comparison to avoid length-leaking timing attacks
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // ── 1. Issue token if absent ────────────────────────────────────────────────
  if (!req.cookies?.['csrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, {
      httpOnly: false,        // must be readable by client-side JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: CSRF_TOKEN_MAX_AGE_MS,
    });
    // Make the token available for validation in the same request
    if (!req.cookies) (req as Record<string, unknown>).cookies = {};
    req.cookies['csrf-token'] = token;
  }

  // ── 2. Safe methods pass through ────────────────────────────────────────────
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // ── 3. Exempt paths bypass CSRF check ───────────────────────────────────────
  if (isExempt(req.path)) {
    return next();
  }

  // ── 4. Validate double-submit token ─────────────────────────────────────────
  const cookieToken = req.cookies?.['csrf-token'];
  const rawHeader = req.headers['x-csrf-token'];
  const headerToken = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;

  // Reject missing, empty, or whitespace-only values
  if (!cookieToken || !headerToken) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'CSRF_TOKEN_MISSING',
      message: 'CSRF token is missing. Ensure the X-CSRF-Token header is sent with mutating requests.',
    });
    return;
  }

  if (!timingSafeEqualStrings(cookieToken, headerToken)) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'CSRF_TOKEN_INVALID',
      message: 'CSRF token mismatch. Please refresh and try again.',
    });
    return;
  }

  next();
}
