import { RequestHandler } from 'express';

// API Version definitions
export interface ApiVersion {
  version: string;
  status: 'current' | 'deprecated' | 'sunset';
  baseUrl: string;
  releaseDate: string;
  sunsetDate?: string;
  deprecationDate?: string;
}

export const API_VERSIONS: ApiVersion[] = [
  {
    version: 'v1',
    status: 'deprecated',
    baseUrl: '/api/v1',
    releaseDate: '2024-01-01',
    deprecationDate: '2025-12-01',
    sunsetDate: '2026-12-01',
  },
  {
    version: 'v2',
    status: 'current',
    baseUrl: '/api/v2',
    releaseDate: '2025-12-01',
  },
];

/**
 * Middleware to add API-Version header to all responses.
 */
export const apiVersionHeader =
  (version: string): RequestHandler =>
  (_req, res, next) => {
    res.set('API-Version', version);
    next();
  };

/**
 * Middleware to mark an endpoint as deprecated.
 * Adds Deprecation, Sunset, and Link headers per RFC 8594.
 */
export const deprecated =
  (sunsetDate: string, successorUrl?: string): RequestHandler =>
  (_req, res, next) => {
    res.set('Deprecation', 'true');
    res.set('Sunset', sunsetDate);
    if (successorUrl) {
      res.set('Link', `<${successorUrl}>; rel="successor-version"`);
    }
    next();
  };

/**
 * Middleware to add deprecation warnings for v1 endpoints
 */
export const v1DeprecationWarning: RequestHandler = (_req, res, next) => {
  const sunsetDate = new Date();
  sunsetDate.setMonth(sunsetDate.getMonth() + 6); // 6 months from now

  res.set('Deprecation', 'true');
  res.set('Sunset', sunsetDate.toISOString().split('T')[0]);
  res.set('Link', '</api/v2>; rel="successor-version"');
  res.set(
    'Warning',
    '299 - "API v1 is deprecated. Please migrate to v2. See /api/versions for details."'
  );

  next();
};

/**
 * Get all supported API versions with their status and upgrade path.
 */
export function getSupportedVersions() {
  return {
    versions: API_VERSIONS,
    current: 'v2',
    deprecated: API_VERSIONS.filter((v) => v.status === 'deprecated'),
    sunset: API_VERSIONS.filter((v) => v.status === 'sunset'),
    upgradePath: {
      from: 'v1',
      to: 'v2',
      deprecatedAt: '2025-12-01',
      sunsetAt: '2026-12-01',
      breakingChanges: [
        'Appointment response shape updated — date fields are now ISO-8601 strings',
        'Pagination envelope moved from data[] to items[] with a meta object',
      ],
      migrationGuide: 'https://docs.health-watchers.io/api/migration-v1-v2',
    },
  };
}

/**
 * Middleware that validates the Accept-Version request header.
 * Rejects unknown versions (406) and sunset versions (410).
 * When a valid version is specified it overwrites the API-Version response header.
 */
export const acceptVersionMiddleware: RequestHandler = (req, res, next) => {
  const requested = req.headers['accept-version'] as string | undefined;
  if (!requested) return next();

  const matched = API_VERSIONS.find((v) => v.version === requested);
  if (!matched) {
    return res.status(406).json({
      error: 'NotAcceptable',
      message: `API version '${requested}' is not supported. See /api/versions for available versions.`,
    });
  }
  if (matched.status === 'sunset') {
    return res.status(410).json({
      error: 'Gone',
      message: `API version '${requested}' has been sunset. Please migrate to v2. See /api/versions for upgrade path.`,
    });
  }

  res.set('API-Version', matched.version);
  next();
};
