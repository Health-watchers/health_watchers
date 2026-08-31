import crypto from 'crypto';

/**
 * Secure, self-verifying meeting links (#1249).
 *
 * A link token is `base64url(payload).base64url(hmacSha256(payload))`. It carries
 * the session id, the invited identity, their role and an expiry, so a leaked
 * link cannot be reused after it expires, cannot be pointed at another session
 * and cannot have its role escalated without invalidating the signature.
 */
export interface MeetingLinkPayload {
  sessionId: string;
  identity: string;
  role: string;
  /** Unix seconds. */
  exp: number;
  /** Random id — lets callers enforce single use. */
  jti: string;
}

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

function secret(): string {
  return (
    process.env.TELEHEALTH_LINK_SECRET ||
    process.env.JWT_ACCESS_TOKEN_SECRET ||
    'telehealth-dev-secret-change-me'
  );
}

function sign(encodedPayload: string): string {
  return crypto.createHmac('sha256', secret()).update(encodedPayload).digest('base64url');
}

export interface CreateMeetingLinkOptions {
  sessionId: string;
  identity: string;
  role: string;
  ttlSeconds?: number;
  baseUrl?: string;
  now?: Date;
}

export interface CreatedMeetingLink {
  token: string;
  url: string;
  expiresAt: Date;
  jti: string;
}

export function createMeetingLink(options: CreateMeetingLinkOptions): CreatedMeetingLink {
  const now = options.now ?? new Date();
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const payload: MeetingLinkPayload = {
    sessionId: options.sessionId,
    identity: options.identity,
    role: options.role,
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: crypto.randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encoded}.${sign(encoded)}`;
  const base = (options.baseUrl || process.env.WEB_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
  return {
    token,
    url: `${base}/telehealth/join?token=${token}`,
    expiresAt,
    jti: payload.jti,
  };
}

export class MeetingLinkError extends Error {}

/**
 * Verify a token's signature and expiry. Throws `MeetingLinkError` on any
 * problem; returns the decoded payload on success.
 */
export function verifyMeetingLink(token: string, now = new Date()): MeetingLinkPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new MeetingLinkError('Malformed meeting token');
  const [encoded, providedSig] = parts;

  const expectedSig = sign(encoded);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new MeetingLinkError('Invalid meeting token signature');
  }

  let payload: MeetingLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new MeetingLinkError('Unreadable meeting token payload');
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < now.getTime()) {
    throw new MeetingLinkError('Meeting link has expired');
  }
  return payload;
}
