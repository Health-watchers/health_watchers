/**
 * #1253 — Webhook signature scheme (v1, timestamped).
 *
 * Outbound requests carry:
 *   X-Webhook-Timestamp: <unix seconds>
 *   X-Webhook-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
 *
 * The signed string is `${timestamp}.${rawBody}`, so a captured request cannot
 * be replayed against a different body or outside the freshness window.
 *
 * The legacy header form (bare hex HMAC of the body) is still accepted by
 * `verifyLegacySignature` for receivers that have not upgraded.
 */

import crypto from 'crypto';

export const SIGNATURE_HEADER = 'x-webhook-signature';
export const TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function hmac(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export interface SignedHeaders {
  [SIGNATURE_HEADER]: string;
  [TIMESTAMP_HEADER]: string;
}

/** Build the headers for an outbound delivery. */
export function buildSignatureHeaders(
  secret: string,
  rawBody: string,
  now: Date = new Date()
): SignedHeaders {
  const ts = Math.floor(now.getTime() / 1000);
  const signature = hmac(secret, `${ts}.${rawBody}`);
  return {
    [TIMESTAMP_HEADER]: String(ts),
    [SIGNATURE_HEADER]: `t=${ts},v1=${signature}`,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface VerifyResult {
  valid: boolean;
  reason?: 'malformed' | 'stale' | 'mismatch';
}

/** Parse and verify a `t=…,v1=…` signature header against the raw body. */
export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  opts: { toleranceSeconds?: number; now?: Date } = {}
): VerifyResult {
  if (!header) return { valid: false, reason: 'malformed' };

  const parts = Object.fromEntries(
    header
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((pair) => pair.length === 2)
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) {
    return { valid: false, reason: 'malformed' };
  }

  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSec - Number(parts.t)) > tolerance) {
    return { valid: false, reason: 'stale' };
  }

  const expected = hmac(secret, `${parts.t}.${rawBody}`);
  return safeEqualHex(expected, parts.v1) ? { valid: true } : { valid: false, reason: 'mismatch' };
}

/** Back-compat: bare hex HMAC of the body, no timestamp / replay protection. */
export function verifyLegacySignature(
  secret: string,
  rawBody: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  return safeEqualHex(hmac(secret, rawBody), signature);
}
