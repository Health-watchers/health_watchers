/**
 * sanitize.middleware.ts
 *
 * OWASP A03 — Injection + A07 — XSS Prevention
 *
 * Provides two layers of protection that complement express-mongo-sanitize:
 *
 *  1. sanitizeInput  — strips control characters, null bytes, and dangerous
 *     Unicode sequences from all string values in req.body, req.query, and
 *     req.params. Does NOT HTML-encode (that is the rendering layer's job);
 *     instead it removes content that has no legitimate use in API payloads.
 *
 *  2. htmlEncodeOutput — middleware that wraps res.json() and HTML-encodes the
 *     five characters that enable XSS (<, >, &, ", ') inside JSON string values.
 *     This is a defence-in-depth measure; the primary XSS defence is the CSP
 *     header set by Helmet. It is safe to apply globally because the client
 *     should always decode JSON values before rendering.
 *
 *  3. preventPrototypePollution — rejects any request body whose top-level
 *     keys include __proto__, constructor, or prototype, which are the standard
 *     prototype-pollution vectors.
 */

import { Request, Response, NextFunction } from 'express';

// ── Characters to strip ───────────────────────────────────────────────────────

/** Null bytes and ASCII control characters (except tab/LF/CR which are valid). */
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Unicode direction-override and zero-width characters sometimes used for
 *  obfuscation attacks (Trojan Source, invisible injections, etc.). */
const DANGEROUS_UNICODE_RE =
  /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFFFE\uFFFF]/g;

// ── HTML-encoding map ─────────────────────────────────────────────────────────
const HTML_ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

function htmlEncodeChar(c: string): string {
  return HTML_ENCODE_MAP[c] ?? c;
}

// ── Recursive sanitizer ───────────────────────────────────────────────────────

function sanitizeValue(value: unknown, depth = 0): unknown {
  // Guard against deeply-nested objects (prototype-pollution / DoS)
  if (depth > 20) return '[DEPTH_LIMIT]';

  if (typeof value === 'string') {
    return value
      .replace(CONTROL_CHAR_RE, '')
      .replace(DANGEROUS_UNICODE_RE, '');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Reject keys that are prototype-pollution vectors
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      result[k] = sanitizeValue(v, depth + 1);
    }
    return result;
  }

  return value;
}

function htmlEncodeValue(value: unknown, depth = 0): unknown {
  if (depth > 20) return value;

  if (typeof value === 'string') {
    return value.replace(/[&<>"'/]/g, htmlEncodeChar);
  }

  if (Array.isArray(value)) {
    return value.map((item) => htmlEncodeValue(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = htmlEncodeValue(v, depth + 1);
    }
    return result;
  }

  return value;
}

// ── Middleware: sanitizeInput ─────────────────────────────────────────────────

/**
 * Strips null bytes, control characters, and dangerous Unicode from all string
 * values in body, query, and params. Removes prototype-pollution keys.
 *
 * Register AFTER body parsing and express-mongo-sanitize.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query) as typeof req.query;
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params) as typeof req.params;
  }

  next();
}

// ── Middleware: preventPrototypePollution ─────────────────────────────────────

/**
 * Rejects any request body whose top-level (or nested) keys include known
 * prototype-pollution vectors: __proto__, constructor, prototype.
 *
 * Returns 400 immediately so the payload never reaches the application.
 */
function hasPollutionKey(obj: unknown, depth = 0): boolean {
  if (depth > 10 || obj === null || typeof obj !== 'object') return false;

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (hasPollutionKey((obj as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

export function preventPrototypePollution(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.body && hasPollutionKey(req.body)) {
    res.status(400).json({
      error: 'BadRequest',
      code: 'PROTOTYPE_POLLUTION_ATTEMPT',
      message: 'Request body contains forbidden keys.',
    });
    return;
  }
  next();
}

// ── Middleware: htmlEncodeOutput ──────────────────────────────────────────────

/**
 * Defence-in-depth XSS guard on JSON responses.
 *
 * Wraps res.json() and HTML-encodes the characters that enable reflected XSS
 * (&, <, >, ", ', /) inside every string value of the response body.
 *
 * The primary XSS defence is the Content-Security-Policy header (set by
 * Helmet). This middleware is a secondary layer that eliminates the risk even
 * if CSP is misconfigured or the client renders content without sanitization.
 *
 * NOTE: Clients that need unencoded text should decode HTML entities before
 * rendering (standard practice for all HTML-aware renderers).
 */
export function htmlEncodeOutput(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Only encode if the body is an object / array (not primitive status responses)
    const encoded = body !== null && typeof body === 'object'
      ? htmlEncodeValue(body)
      : body;
    return originalJson(encoded);
  };

  next();
}
