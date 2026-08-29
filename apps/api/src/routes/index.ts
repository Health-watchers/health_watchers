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
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * app.ts wires these into express — see app.ts for middleware stacks applied
 * per version (rate limiting, versioning headers, response filtering, etc.).
 *
 * Adding a new route group
 * ────────────────────────
 * 1. Create  src/routes/<group>/index.ts  (export a named Router)
 * 2. Re-export it here
 * 3. Mount it in the appropriate versioned router (v1/index.ts or v2/index.ts)
 * 4. Update the table above and ROUTES.md
 */

export { v1Router } from './v1';
export { v2Router } from './v2';
export { cdnRouter } from './cdn';
export { default as replicationRouter } from './replication';
