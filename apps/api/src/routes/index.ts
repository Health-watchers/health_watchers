/**
 * API Route Registry
 *
 * Central export point for all versioned and infrastructure routers.
 * Import from here instead of from individual route files.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Router         │ Mount point              │ Description                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  v1Router       │ /api/v1                  │ Current stable API         │
 * │  v2Router       │ /api/v2                  │ Next-gen API (breaking)    │
 * │  cdnRouter      │ /api/v1/cdn              │ CDN cache management       │
 * │  replicationRtr │ /api/v1/replication      │ DB replication ops (admin) │
 * │  readyRouter    │ /ready                   │ Readiness probe (DB check) │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * app.ts wires these into express — see app.ts for middleware stacks applied
 * per version (rate limiting, versioning headers, response filtering, etc.).
 *
 * Rate limiting
 * ─────────────
 * Sensitive endpoints receive stricter, Redis-backed sliding-window limiters
 * (see middleware/rateLimit.ts). The general limiter remains the default for
 * all other routes.
 *
 * ┌──────────────────────┬──────────────────────────────────────────────────┐
 * │  Path                │  Limiter                                         │
 * ├──────────────────────┼──────────────────────────────────────────────────┤
 * │  /auth/login         │  authLimiter                                     │
 * │  /auth/register      │  authLimiter                                     │
 * │  /export/*           │  exportRateLimit                                 │
 * │  /ai/*               │  aiLimiter                                       │
 * │  /portal/mfa/*       │  portalMfaLimiter                                │
 * │  (all other routes)  │  generalLimiter                                  │
 * └──────────────────────┴──────────────────────────────────────────────────┘
 *
 * Adding a new route group
 * ────────────────────────
 * 1. Create  src/routes/<group>/index.ts  (export a named Router)
 * 2. Re-export it here
 * 3. Mount it in the appropriate versioned router (v1/index.ts or v2/index.ts)
 * 4. Update the table above and ROUTES.md
 */

import { Router } from 'express';
import {
  generalLimiter,
  authLimiter,
  exportRateLimit,
  aiLimiter,
  portalMfaLimiter,
} from '../middleware/rateLimit';

export { v1Router } from './v1';
export { v2Router } from './v2';
export { cdnRouter } from './cdn';
export { default as replicationRouter } from './replication';
export { readyRouter } from './ready';

/**
 * Sensitive route groups that require stricter rate limiting.
 *
 * Each entry pairs a mount path with the limiter that should guard it.
 * These are mounted ahead of the general limiter so that the stricter
 * policy takes precedence for matching requests.
 */
export const sensitiveRouteLimiters: Array<{
  path: string;
  limiter: import('express').RequestHandler;
}> = [
  { path: '/auth/login', limiter: authLimiter },
  { path: '/auth/register', limiter: authLimiter },
  { path: '/export', limiter: exportRateLimit },
  { path: '/ai', limiter: aiLimiter },
  { path: '/portal/mfa', limiter: portalMfaLimiter },
];

/**
 * Builds a router that applies the stricter limiters to sensitive paths
 * and falls back to the general limiter for everything else.
 *
 * Mount the returned router at the API root (e.g. `/api/v1`) before the
 * versioned routers so the limiters run ahead of route handlers.
 */
export function createRateLimitRouter(): Router {
  const router = Router();

  for (const { path, limiter } of sensitiveRouteLimiters) {
    router.use(path, limiter);
  }

  // Default limiter for all remaining routes.
  router.use(generalLimiter);

  return router;
}

export default createRateLimitRouter;