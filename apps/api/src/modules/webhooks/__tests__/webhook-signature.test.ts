import crypto from 'crypto';
import {
  buildSignatureHeaders,
  verifySignature,
  verifyLegacySignature,
  hmac,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '../webhook-signature';

const SECRET = 'whsec_test';
const BODY = JSON.stringify({ event: 'webhook.test', data: { n: 1 } });

describe('buildSignatureHeaders', () => {
  it('produces a t=,v1= signature over `${ts}.${body}`', () => {
    const now = new Date('2026-08-30T12:00:00Z');
    const headers = buildSignatureHeaders(SECRET, BODY, now);
    const ts = Math.floor(now.getTime() / 1000);

    expect(headers[TIMESTAMP_HEADER]).toBe(String(ts));
    expect(headers[SIGNATURE_HEADER]).toBe(`t=${ts},v1=${hmac(SECRET, `${ts}.${BODY}`)}`);
  });
});

describe('verifySignature', () => {
  it('accepts a freshly built signature', () => {
    const now = new Date();
    const headers = buildSignatureHeaders(SECRET, BODY, now);
    expect(verifySignature(SECRET, BODY, headers[SIGNATURE_HEADER], { now }).valid).toBe(true);
  });

  it('rejects a tampered body (replay against different payload)', () => {
    const now = new Date();
    const headers = buildSignatureHeaders(SECRET, BODY, now);
    const result = verifySignature(SECRET, '{"event":"evil"}', headers[SIGNATURE_HEADER], { now });
    expect(result).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('rejects a signature outside the freshness window', () => {
    const signedAt = new Date('2026-08-30T12:00:00Z');
    const checkedAt = new Date('2026-08-30T12:10:00Z'); // +10 min > 5 min tolerance
    const headers = buildSignatureHeaders(SECRET, BODY, signedAt);
    const result = verifySignature(SECRET, BODY, headers[SIGNATURE_HEADER], { now: checkedAt });
    expect(result).toEqual({ valid: false, reason: 'stale' });
  });

  it('rejects a malformed header', () => {
    expect(verifySignature(SECRET, BODY, 'garbage').reason).toBe('malformed');
    expect(verifySignature(SECRET, BODY, undefined).reason).toBe('malformed');
  });

  it('rejects a wrong secret', () => {
    const now = new Date();
    const headers = buildSignatureHeaders(SECRET, BODY, now);
    expect(verifySignature('other', BODY, headers[SIGNATURE_HEADER], { now }).valid).toBe(false);
  });
});

describe('verifyLegacySignature', () => {
  it('accepts a bare hex HMAC of the body', () => {
    const sig = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyLegacySignature(SECRET, BODY, sig)).toBe(true);
  });

  it('rejects a bad signature without throwing', () => {
    expect(verifyLegacySignature(SECRET, BODY, 'deadbeef')).toBe(false);
    expect(verifyLegacySignature(SECRET, BODY, undefined)).toBe(false);
  });
});
