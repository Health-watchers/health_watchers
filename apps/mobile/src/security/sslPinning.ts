/**
 * SSL public-key pinning for the Health Watchers API (issue #1500).
 *
 * Pins are base64 SHA-256 hashes of the server certificate's Subject Public Key Info,
 * supplied at build time through EAS secrets:
 *
 *   EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES   primary,backup[,…]  (at least two — iOS requires it)
 *   EXPO_PUBLIC_SSL_PINS_EXPIRE_ON      optional yyyy-MM-dd after which pinning is lifted
 *
 * Pinning is enforced natively (OkHttp / TrustKit), so it covers fetch and axios alike. A
 * request through a proxy with a user-installed CA (e.g. mitmproxy) fails the TLS handshake.
 * See docs/SECURITY_PINNING.md for generating pins and the rotation procedure.
 */
import {
  addSslPinningErrorListener,
  initializeSslPinning,
  isSslPinningAvailable,
  type PinningOptions,
} from 'react-native-ssl-public-key-pinning';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const MIN_PINS = 2;
const PIN_FORMAT = /^[A-Za-z0-9+/]{43}=$/; // base64 of a 32-byte SHA-256 digest

export type PinningStatus =
  | { enabled: true; hostname: string; pinCount: number }
  | { enabled: false; reason: string };

export function parsePins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Builds the native pinning config, or throws if the pin set is unusable. */
export function buildPinningOptions(
  apiUrl: string,
  pins: string[],
  expirationDate?: string
): { hostname: string; options: PinningOptions } {
  const hostname = new URL(apiUrl).hostname;
  const invalid = pins.filter((p) => !PIN_FORMAT.test(p));
  if (invalid.length > 0) {
    throw new Error(`Invalid SSL pin(s): ${invalid.join(', ')}`);
  }
  if (new Set(pins).size < MIN_PINS) {
    throw new Error(
      `SSL pinning needs at least ${MIN_PINS} distinct pins (primary + backup) for ${hostname}`
    );
  }
  return {
    hostname,
    options: {
      [hostname]: {
        includeSubdomains: false,
        publicKeyHashes: pins,
        ...(expirationDate ? { expirationDate } : {}),
      },
    },
  };
}

/**
 * Must run before the first API request. Release builds fail closed: a missing or
 * malformed pin set throws instead of silently shipping without pinning.
 */
export async function configureSslPinning(): Promise<PinningStatus> {
  const pins = parsePins(process.env.EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES);

  if (!isSslPinningAvailable()) {
    // Expo Go / web — the native module only exists in development and release builds
    if (!__DEV__) throw new Error('SSL pinning native module is missing from this build');
    return { enabled: false, reason: 'native module unavailable (Expo Go or web)' };
  }

  if (pins.length === 0 && __DEV__) {
    console.warn('[security] SSL pinning disabled: EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES is not set');
    return { enabled: false, reason: 'no pins configured (development build)' };
  }

  const { hostname, options } = buildPinningOptions(
    API_URL,
    pins,
    process.env.EXPO_PUBLIC_SSL_PINS_EXPIRE_ON || undefined
  );
  await initializeSslPinning(options);

  addSslPinningErrorListener((error) => {
    // Never log request contents here — only the host whose certificate failed the pin check
    console.warn(`[security] SSL pin validation failed for ${error.serverHostname}`);
  });

  return { enabled: true, hostname, pinCount: pins.length };
}
