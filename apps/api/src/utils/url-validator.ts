// SSRF protection for outbound HTTP requests (issue #1668).
//
// `isBlockedHost` / `validateWebhookUrl` are the original blocklist helpers and
// keep their signatures and reason strings for backward compatibility.
// `isAllowedHost` / `validateOutboundUrl` / `assertOutboundUrlAllowed` add
// allowlist support for fixed outbound targets (Stellar Horizon, exchange-rate
// APIs, stellar-service).

const BLOCKED_HOST_PATTERNS = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^0\.\d+\.\d+\.\d+$/,
  /^localhost$/i,
  /^::1$/,
  // URL.hostname returns bracketed IPv6, e.g. new URL('https://[::1]/').hostname === '[::1]'
  /^\[::1\]$/,
  /^\[::ffff:127\.\d+\.\d+\.\d+\]$/i,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

export function isBlockedHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  return BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
}

export function validateWebhookUrl(url: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS URLs are allowed' };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { valid: false, reason: 'URL resolves to a blocked IP range' };
  }

  return { valid: true };
}

/**
 * Case-insensitive exact or subdomain match against an allowlist.
 * An empty allowlist matches nothing.
 */
export function isAllowedHost(hostname: string, allowlist: string[]): boolean {
  if (!hostname || !allowlist || allowlist.length === 0) return false;
  const host = hostname.toLowerCase();
  return allowlist.some((entry) => {
    const allowed = (entry || '').trim().toLowerCase();
    if (!allowed) return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

export interface OutboundUrlOptions {
  allowlist?: string[];
  enforceAllowlist?: boolean;
  requireHttps?: boolean;
}

/**
 * Validate an outbound URL against the SSRF blocklist and (optionally) an
 * allowlist of permitted hostnames.
 */
export function validateOutboundUrl(
  url: string,
  opts: OutboundUrlOptions = {}
): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }

  if (opts.requireHttps && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS URLs are allowed' };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { valid: false, reason: 'URL resolves to a blocked IP range' };
  }

  if (opts.enforceAllowlist && !isAllowedHost(parsed.hostname, opts.allowlist || [])) {
    return { valid: false, reason: 'Host not in outbound allowlist' };
  }

  return { valid: true };
}

export class SsrfBlockedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Outbound request blocked: ${reason}`);
    this.name = 'SsrfBlockedError';
    this.reason = reason;
  }
}

/**
 * Throwing variant of `validateOutboundUrl` for call sites that prefer
 * exceptions over result objects.
 */
export function assertOutboundUrlAllowed(url: string, opts: OutboundUrlOptions = {}): void {
  const result = validateOutboundUrl(url, opts);
  if (!result.valid) {
    throw new SsrfBlockedError(result.reason || 'Blocked outbound URL');
  }
}
