import type { CorsOptions } from 'cors';

/** Origins from `ALLOWED_ORIGINS`, already split, trimmed and filtered. */
export type AllowedOrigins = readonly string[];

/**
 * A request without an `Origin` header comes from a server, a CLI or a health
 * probe — CORS only governs browsers, so it is allowed.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: AllowedOrigins
): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

/**
 * The `origin` callback for the `cors` middleware.
 *
 * A disallowed origin answers `callback(null, false)`: the middleware sends no
 * CORS headers, the browser blocks the response, and the request is still
 * handled normally. Passing an `Error` instead would route a scanner's request
 * through the global error handler, which only maps `AppError`, `ZodError` and
 * Mongoose errors — so plain `Error`s become a 500 and inflate the 5xx rate.
 */
export function corsOriginCallback(allowedOrigins: AllowedOrigins) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ): void => {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

/** CORS options for the API, with the decision callback above. */
export function buildCorsOptions(allowedOrigins: AllowedOrigins): CorsOptions {
  return {
    origin: corsOriginCallback(allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}
