import Constants from 'expo-constants';

/**
 * Centralised runtime configuration for the mobile app.
 *
 * The API base URL is resolved from `expo-constants` `extra` (populated from
 * `EXPO_PUBLIC_API_URL` at build time). In non-development builds we refuse to
 * start if the URL is missing or not HTTPS, so a misconfigured release build
 * can never ship pointing at cleartext localhost.
 */

const DEFAULT_DEV_API_URL = 'http://localhost:3001/api/v1';

type ExtraConfig = {
  apiUrl?: string;
};

function readExtra(): ExtraConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
  return extra;
}

function isDevelopment(): boolean {
  // `__DEV__` is true for development builds and false for release builds.
  // Fall back to NODE_ENV when `__DEV__` is not defined (e.g. in tests).
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  return process.env.NODE_ENV !== 'production';
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveApiUrl(): string {
  const extra = readExtra();
  const configured =
    extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? undefined;

  const trimmed = configured?.trim();

  if (isDevelopment()) {
    // In development we allow a localhost fallback for convenience.
    return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_DEV_API_URL;
  }

  // Non-development (release) builds: fail fast on missing or insecure URLs.
  if (!trimmed || trimmed.length === 0) {
    throw new Error(
      'Missing API URL: EXPO_PUBLIC_API_URL must be set for non-development builds.',
    );
  }

  if (!isValidHttpsUrl(trimmed)) {
    throw new Error(
      `Invalid API URL "${trimmed}": non-development builds require an https:// URL.`,
    );
  }

  return trimmed;
}

export const API_URL: string = resolveApiUrl();

export const config = {
  apiUrl: API_URL,
  isDevelopment: isDevelopment(),
} as const;

export default config;