import './tracing'; // must be first — initialises OpenTelemetry SDK before any other import
import './instrument'; // must be first — initialises Sentry before any other module
import './config/env'; // must be second — validates env vars

import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import {
  createCompressionMiddleware,
  compressionMetricsEndpoint,
} from './middlewares/compression.middleware';
import pinoHttp from 'pino-http';
import mongoSanitize from 'express-mongo-sanitize';
import { healthRoutes } from './modules/health/health.controller';
import { backupHealthRoutes } from './modules/health/backup-health.controller';
import { readyRoutes } from './modules/health/ready.controller';
import { setupSwagger } from './docs/swagger';
import { errorHandler } from './middlewares/error.middleware';
import { generalLimiter } from './middlewares/rate-limit.middleware';
import { rateLimitMonitor } from './middlewares/rate-limit-monitor.middleware';
import {
  apiVersionHeader,
  v1DeprecationWarning,
  getSupportedVersions,
  acceptVersionMiddleware,
} from './middlewares/api-versioning.middleware';
import { v1EnvelopeNormalizer } from './middlewares/v1-envelope.middleware';
import { v1DeprecationForRoute } from './middlewares/v1-deprecation.middleware';
import { traceIdHeader } from './middlewares/trace-id.middleware';
import { jobsAdminRouter } from './jobs/jobs-admin.controller';
import { fhirRouter } from './modules/fhir/fhir.router';
import { metricsMiddleware } from './middlewares/metrics.middleware';
import metricsRouter from './modules/metrics/metrics.routes';
import logger from './utils/logger';
import { v2Router } from './routes/v2';
import { v1Router } from './routes/v1';
import { requestAuditMiddleware } from './middlewares/request-audit.middleware';
import { mutationAuditMiddleware } from './middlewares/mutation-audit.middleware';
import cookieParser from 'cookie-parser';
import { csrfMiddleware } from './middlewares/csrf.middleware';
import federationRouter from './modules/federation/federation.router';
import { requestIdPropagationMiddleware } from './middlewares/request-id-propagation.middleware';
import { responseFilterMiddleware } from './middlewares/response-filter.middleware';
import { migrationStatusRouter } from './modules/migrations/migration-status.controller';
import { errorAnalyticsRouter } from './modules/monitoring/error-analytics.controller';
import { rateLimitConfigRouter } from './modules/rate-limiting/rate-limit-config.controller';
import { cacheDebugRouter } from './modules/caching/cache-debug.controller';
import { registerPatientListWarmup } from './services/cache.service';
import { errorAnalytics } from './services/error-analytics.service';
import { migrationManager } from './services/migration-manager.service';
import { config as appConfig } from './config/config.service';
import { createRequestLoggerMiddleware } from './middlewares/request-logger.middleware';

const app = express();
const server = createServer(app);
// Port comes from the validated API_PORT (default 3001) via config.service.
// PORT is honoured only as a documented override for PaaS hosts (Heroku, Render, etc.)
// that inject their own port and expect the process to bind to it.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : appConfig.api.port;

// Trust the first proxy hop (NGINX/load-balancer) so req.ip reflects the real client IP.
// Without this, every request appears to come from the proxy IP and rate limiting breaks.
// Set TRUST_PROXY=false to disable (direct connections only), or to a hop count > 1.
if (process.env.TRUST_PROXY !== undefined) {
  app.set(
    'trust proxy',
    process.env.TRUST_PROXY === 'false' ? false : Number(process.env.TRUST_PROXY)
  );
} else if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 16kb per issue #1800)
// Per-route overrides for large clinical payloads are applied in each module's router.
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? '16kb';

// ── Security & performance ────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        reportUri: ['/api/v1/csp-report'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);
app.use(createCompressionMiddleware());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) and listed origins.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── HTTP request logging with correlation ID ──────────────────────────────────
// #1678 — standardised JSON log format. Every log line carries the mandatory
// fields timestamp, level, service, requestId and message (emitted by the
// shared logger), and request-scoped entries additionally carry clinicId/userId.
const isProd = process.env.NODE_ENV === 'production';
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    autoLogging: {
      ignore: (req) =>
        isProd &&
        (req.url === '/health/live' ||
          req.url === '/health/ready' ||
          req.url === '/health/startup'),
    },
    redact: ['req.headers.authorization'],
    // Bind request-scoped context (requestId, clinicId, userId) to every log
    // entry emitted while handling this request.
    customProps: (req) => {
      const r = req as any;
      return {
        requestId: r.requestId ?? r.id,
        clinicId: r.clinicId ?? r.user?.clinicId,
        userId: r.user?.id ?? r.user?._id,
      };
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);
// Attach clinicId/userId to the request-scoped logger once auth has populated
// req.user, so downstream handlers log with full context.
app.use(createRequestLoggerMiddleware);

// ── Request ID correlation & propagation ──────────────────────────────────────
// requestIdPropagationMiddleware is the single request-ID middleware (#1802).
// It honours an incoming X-Request-ID header (or generates a UUID v4), stamps
// req.requestId, echoes the value on the response header, and stores it in
// AsyncLocalStorage so downstream services and log entries carry the same ID.
app.use(requestIdPropagationMiddleware);

// ── Body parsing & sanitization ───────────────────────────────────────────────
app.use(cookieParser());
// Capture the raw request body so webhook signature verification can compute
// an HMAC over the exact bytes received (JSON re-serialization is not stable).
app.use(
  express.json({
    limit: standardLimit,
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: standardLimit }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(requestAuditMiddleware);
app.use(mutationAuditMiddleware);
app.use(csrfMiddleware);

// ── Content-Type validation (issue #351) ──────────────────────────────────────
// Reject non-JSON bodies on mutating requests (POST/PUT/PATCH)
// Bypass for multipart/form-data routes (e.g. CSV import) and CSP violation reports.
// Patterns are anchored exact matches so only real upload endpoints skip the check —
// a prefix like '/api/v1/patients/' would disable 415 enforcement for every patient route.
const MULTIPART_BYPASS: RegExp[] = [
  /^\/api\/v1\/patients\/import$/,
  /^\/api\/v1\/patients\/[^/]+\/photo$/,
  /^\/api\/v1\/ai\/transcribe-audio$/,
];
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] !== '0') {
    if (MULTIPART_BYPASS.some((pattern) => pattern.test(req.path))) return next();
    if (req.path.startsWith('/api/v1/csp-report')) return next();
    if (!req.is('application/json') && !req.is('application/x-www-form-urlencoded')) {
      return res
        .status(415)
        .json({ error: 'UnsupportedMediaType', message: 'Content-Type must be application/json' });
    }
  }
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
// /health is a lightweight liveness endpoint (no dependency checks).
app.use('/health', healthRoutes);
app.use('/health', backupHealthRoutes);
// /ready (and /health/ready) is the readiness endpoint — verifies DB connectivity
// so Kubernetes stops routing traffic to a pod that cannot serve requests.
app.use('/ready', readyRoutes);
app.use('/health/ready', readyRoutes);

// ── Prometheus metrics ────────────────────────────────────────────────────────
// Must be registered before API routes so all requests are measured
app.use(metricsMiddleware);
app.use('/metrics', metricsRouter);

// ── Compression metrics ──────────────────────────────────────────────────────
app.get('/metrics/compression', compressionMetricsEndpoint);

// ── API versions endpoint ─────────────────────────────────────────────────────
app.get('/api/versions', (_req, res) => {
  const versions = getSupportedVersions();
  res.json(versions);
});

// ── Accept-Version header negotiation ─────────────────────────────────────────
app.use('/api', acceptVersionMiddleware);

// ── V1 API Routes (with deprecation warnings) ────────────────────────────────
// #1795 — deprecation headers are only emitted for v1 routes that actually have
// a v2 replacement (per-route map), instead of blanket-deprecating every route.
app.use('/api/v1', v1DeprecationForRoute);
app.use('/api/v1', apiVersionHeader('1.0'));
app.use('/api/v1', traceIdHeader);
app.use('/api/v1', rateLimitMonitor);
app.use('/api/v1', generalLimiter);
app.use('/api/v1', responseFilterMiddleware);
// #1794 — v1 keeps its legacy response shapes; normalise them in one place so
// clients see a single contract while modules migrate to res.ok()/res.fail().
app.use('/api/v1', v1EnvelopeNormalizer);
app.use('/api/v1', v1Router);

// ── V2 API Routes (current) ───────────────────────────────────────────────────
app.use('/api/v2', apiVersionHeader('2.0'));
app.use('/api/v2', traceIdHeader);
app.use('/api/v2', rateLimitMonitor);
app.use('/api/v2', generalLimiter);
app.use('/api/v2', responseFilterMiddleware);
app.use('/api/v2', v2Router);

// ── FHIR R4 read API (#1435) — clinic API keys with patient/*.read scopes ─────
app.use('/fhir/r4', generalLimiter, fhirRouter);

// ── Stellar federation (public, no auth) ──────────────────────────────────────
// Mounted at root level to comply with Stellar federation protocol standards
app.use('/.well-known', federationRouter);
app.use('/federation', federationRouter);

// ── Admin monitoring & management endpoints ───────────────────────────────────
app.use('/api/v2', migrationStatusRouter);
app.use('/api/v2', errorAnalyticsRouter);
app.use('/api/v2', rateLimitConfigRouter);
app.use('/api/v2', cacheDebugRouter);
app.use('/api/v2', jobsAdminRouter);

setupSwagger(app);

// ── 404 & global error handler ────────────────────────────────────────────────
// #1794 — standard error envelope: { error: { code, message, details?, requestId } }
app.use('*', (req, res) =>
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: (req as any).requestId ?? (req.headers['x-request-id'] as string) ?? null,
    },
  })
);

// ── 413 Request Entity Too Large ──────────────────────────────────────────────
// express.json() calls next(err) with err.type === 'entity.too.large' when the
// body exceeds the configured limit. We surface a structured error envelope so
// the web UI can show a human-readable message rather than an empty response.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'PayloadTooLarge',
      code: 'PAYLOAD_TOO_LARGE',
      message:
        'The request body is too large. ' +
        'If you are saving clinical notes or attachments, please reduce the payload size or ' +
        'contact support to request a higher limit for this endpoint.',
      requestId: (req as any).requestId,
    });
  }
  return next(err);
});
app.use(errorHandler);

export default app;

// ── Start server ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();

  // #1797 — migrate-mongo is the single migration system. Migrations are applied
  // by a dedicated deployment step (Kubernetes Job / Helm pre-upgrade hook), never
  // by the API. On startup we only verify that nothing is pending; if migrations
  // are outstanding the readiness probe keeps failing so the pod never receives
  // traffic with a stale schema.
  try {
    const { pending, applied, total } = await checkPendingMigrations();
    if (pending.length > 0) {
      logger.error(
        { pending, applied, total },
        '[migrations] pending migrations detected — pod will not become ready until they are applied'
      );
    } else {
      logger.info({ applied, total }, '[migrations] schema is up to date');
    }
  } catch (err) {
    logger.error({ err }, '[migrations] failed to determine migration status — pod will not become ready');
  }

  // Seed built-in CDS rules
  await seedBuiltInRules();

  // Initialise Socket.IO on the HTTP server — realtime/socket.ts is the single
  // Socket.IO entry point (#1775); do not attach a second server to this path.
  initSocket(server);
  logger.info({ service: 'api' }, 'Socket.IO service initialized');

  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server running');
    logger.info({ service: 'api' }, 'Socket.IO server ready for real-time connections');
  });

  // Initialise Socket.IO on the same HTTP server
  initSocket(server);
  logger.info({ service: 'api' }, 'Socket.IO initialised');
  // #1433 — every background job runs through the distributed BullMQ scheduler:
  // each schedule executes once per tick across all replicas.
  startJobScheduler().catch((err) => logger.error({ err }, '[job-registry] failed to start'));
  initializeBackupMetrics().catch((err) =>
    logger.warn({ err }, 'Failed to load initial backup metrics')
  );

  // #1071 — Register per-clinic patient-list cache warmup entries for recently
  // active clinics (updated in the last 24h) so startup work stays bounded.
  // The actual loader is a module-level function in cache.service.ts.
  try {
    const { ClinicModel } = await import('./modules/clinics/clinic.model');
    const recentlyActive = await ClinicModel.find({
      isActive: true,
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
      .select('_id')
      .lean();
    for (const clinic of recentlyActive) {
      registerPatientListWarmup(String(clinic._id));
    }
  } catch (err) {
    logger.warn({ err }, '[cache] failed to register patient-list warmup entries');
  }

  // Warm the cache — fills only cold (missing) keys, safe to run every startup
  warmCache().catch((err) => logger.warn({ err }, '[cache] startup warmup failed'));

  // Track MongoDB connection pool metrics for Prometheus
  setInterval(() => {
    const { totalConnections, waitQueueSize } = getPoolMetrics();
    mongodbConnectionPoolSize.set(totalConnections);
    mongodbPoolWaitQueueSize.set(waitQueueSize);
  }, 15_000);

  registerGracefulShutdown(server, {
    stopJobs: [stopJobScheduler],
  });
}

startServer();
