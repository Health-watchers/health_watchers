/**
 * ETag Service — generates and validates HTTP ETags for cache coherency.
 *
 * ETags are used to implement conditional requests (If-None-Match, If-Modified-Since)
 * so clients can validate stale cache entries without re-downloading unchanged responses.
 *
 * Two ETag flavours are supported:
 *   - Strong ETags  (default): byte-for-byte identical content
 *   - Weak ETags    (W/".."): semantically equivalent content (compression variants)
 */
import crypto from 'crypto';

export type ETagStrength = 'strong' | 'weak';

export interface ETagResult {
  etag: string;
  strength: ETagStrength;
}

/**
 * Generate an ETag from any serialisable value.
 * The value is JSON-serialised and then SHA-1 hashed.
 * SHA-1 is sufficient here — collision resistance for cache
 * validation, not cryptographic security.
 */
export function generateETag(value: unknown, strength: ETagStrength = 'strong'): ETagResult {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value, jsonReplacer);
  const hash = crypto.createHash('sha1').update(serialized).digest('hex').slice(0, 27);
  const etag = strength === 'weak' ? `W/"${hash}"` : `"${hash}"`;
  return { etag, strength };
}

/**
 * Generate an ETag from a Buffer or string (for binary/raw responses).
 */
export function generateBufferETag(buf: Buffer, strength: ETagStrength = 'strong'): ETagResult {
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 27);
  const etag = strength === 'weak' ? `W/"${hash}"` : `"${hash}"`;
  return { etag, strength };
}

/**
 * Validate an incoming If-None-Match header against a current ETag.
 *
 * Returns true when the resource has NOT changed (should return 304).
 * Per RFC 7232, weak ETags are compared with weak comparison; strong with strong.
 */
export function etagMatches(ifNoneMatch: string | undefined, currentETag: string): boolean {
  if (!ifNoneMatch) return false;

  // Wildcard always matches
  if (ifNoneMatch.trim() === '*') return true;

  const candidates = parseETagList(ifNoneMatch);
  const current = parseETagValue(currentETag);

  return candidates.some((candidate) => {
    // Weak comparison: ignore the W/ prefix for both sides
    if (candidate.weak || current.weak) {
      return candidate.value === current.value;
    }
    // Strong comparison
    return candidate.raw === current.raw;
  });
}

/**
 * Validate an incoming If-Match header against a current ETag.
 *
 * Returns true when the resource matches (precondition met).
 * Used for optimistic locking on mutating requests (PUT, PATCH, DELETE).
 */
export function ifMatchPreconditionMet(
  ifMatch: string | undefined,
  currentETag: string
): boolean {
  if (!ifMatch) return true; // No precondition → always met
  if (ifMatch.trim() === '*') return true; // Wildcard matches any

  const candidates = parseETagList(ifMatch);
  const current = parseETagValue(currentETag);

  // If-Match uses strong comparison only
  return candidates.some((c) => !c.weak && c.raw === current.raw);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ParsedETag {
  raw: string;
  value: string;
  weak: boolean;
}

function parseETagValue(etag: string): ParsedETag {
  const trimmed = etag.trim();
  const weak = trimmed.startsWith('W/');
  const raw = weak ? trimmed.slice(2) : trimmed;
  // Strip surrounding quotes from the hash value for comparison
  const value = raw.replace(/^"|"$/g, '');
  return { raw, value, weak };
}

function parseETagList(header: string): ParsedETag[] {
  return header.split(',').map((part) => parseETagValue(part.trim()));
}

/**
 * JSON replacer that sorts object keys for deterministic serialisation.
 * Ensures that `{a:1, b:2}` and `{b:2, a:1}` produce the same ETag.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
  }
  return value;
}

/**
 * Extract a last-modified date from a Mongoose document or a plain object.
 * Falls back to undefined when no timestamp is available.
 */
export function extractLastModified(doc: unknown): Date | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const d = doc as Record<string, unknown>;
  const candidate = d.updatedAt ?? d.updated_at ?? d.createdAt ?? d.created_at;
  if (candidate instanceof Date) return candidate;
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const date = new Date(candidate);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}
