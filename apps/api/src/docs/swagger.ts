import { Express, RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

/**
 * Load the generated OpenAPI spec.
 *
 * The spec is produced by `apps/api/scripts/generate-openapi.js` (run via
 * `npm run generate:openapi`) and committed to `docs/openapi.json`.
 * CI regenerates the spec on every PR and fails when the committed copy
 * drifts from the generated one, guaranteeing that the served spec always
 * reflects the live Zod validation schemas.
 */
const specPath = path.join(__dirname, '../docs/openapi.json');
let swaggerSpec: Record<string, unknown>;

try {
  const raw = fs.readFileSync(specPath, 'utf-8');
  swaggerSpec = JSON.parse(raw);
} catch (err) {
  console.warn(
    `⚠️  Could not load generated OpenAPI spec at ${specPath}: ${(err as Error).message}`
  );
  // Fall back to a minimal spec so the docs endpoint never crashes.
  swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Health Watchers API',
      version: '1.0.0',
      description: 'Generated spec unavailable — run `npm run generate:openapi`.',
    },
    paths: {},
    components: { schemas: {} },
  };
}

/**
 * Swagger UI is only exposed outside production. In production it is either
 * disabled entirely (default) or, when `SWAGGER_ENABLED=true`, mounted behind
 * the supplied authentication middleware so it is never publicly reachable.
 */
export function setupSwagger(
  app: Express,
  authMiddleware?: RequestHandler,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const explicitlyEnabled = process.env.SWAGGER_ENABLED === 'true';

  if (isProduction && !explicitlyEnabled) {
    return;
  }

  const guards: RequestHandler[] = [];
  if (isProduction) {
    if (!authMiddleware) {
      // Refuse to expose docs in production without an auth guard.
      return;
    }
    guards.push(authMiddleware);
  }

  app.use('/api/docs', ...guards, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', ...guards, (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
