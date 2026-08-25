import './tracing'; // must be first — initialises OpenTelemetry SDK before any other import
import './instrument'; // must be first — initialises Sentry before any other module
import './config/env'; // must be second — validates env vars

import crypto from 'crypto';
import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import {
  createCompressionMiddleware,
  compressionMetricsEndpoint,
} from './middlewares/compression.middleware';
import pinoHttp from 'pino-http';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDB, getPoolMetrics } from './config/db';
import { healthRoutes } from './modules/health/health.controller';
import { backupHealthRoutes } from './modules/health/backup-health.controller';
import { initSocket } from './realtime/socket';
import { initializeBackupMetrics } from './services/backup-metrics.service';
import { setupSwagger } from './docs/swagger';
import { errorHandler } from './middlewares/error.middleware';
import { generalLimiter } from './middlewares/rate-limit.middleware';
import {
  apiVersionHeader,
  v1DeprecationWarning,
  getSupportedVersions,
  acceptVersionMiddleware,
} from './middlewares/api-versioning.middleware';
import { traceIdHeader } from './middlewares/trace-id.middleware';
import {
  startPaymentExpirationJob,
  stopPaymentExpirationJob,
} from './modules/payments/services/payment-expiration-job';
import {
  startReconciliationJob,
  stopReconciliationJob,
} from './modules/payments/services/reconciliation-job';
import {
  startRiskRecalculationJob,
  stopRiskRecalculationJob,
} from './modules/patients/risk-recalculation-job';
import {
  startBalanceMonitoringJob,
  stopBalanceMonitoringJob,
} from './modules/payments/services/balance-monitoring-job';
import {
  startWaitlistExpiryJob,
  stopWaitlistExpiryJob,
} from './modules/appointments/waitlist-expiry-job';
import {
  startAppointmentReminderJob,
  stopAppointmentReminderJob,
} from './modules/appointments/appointment-reminder-job';
import {
  startClaimableExpiryNotificationJob,
  stopClaimableExpiryNotificationJob,
} from './modules/payments/services/claimable-expiry-notification-job';
import { startXLMRateJob, stopXLMRateJob } from './modules/payments/services/xlm-rate-job';
import { startMfaGracePeriodJob, stopMfaGracePeriodJob } from './modules/auth/mfa-grace-period-job';
import {
  startFollowUpReminderJob,
  stopFollowUpReminderJob,
} from './modules/encounters/follow-up-reminder-job';
import { mongodbConnectionPoolSize, mongodbPoolWaitQueueSize } from './services/metrics.service';
import { metricsMiddleware } from './middlewares/metrics.middleware';
import metricsRouter from './modules/metrics/metrics.routes';
import logger from './utils/logger';
import { registerGracefulShutdown } from './utils/graceful-shutdown';
import { v2Router } from './routes/v2';
import { v1Router } from './routes/v1';
import { SocketService } from './services/socket.service';
import { requestAuditMiddleware } from './middlewares/request-audit.middleware';
import { mutationAuditMiddleware } from './middlewares/mutation-audit.middleware';
import cookieParser from 'cookie-parser';
import { csrfMiddleware } from './middlewares/csrf.middleware';
import { seedBuiltInRules } from './modules/cds/cds-seed';
import federationRouter from './modules/federation/federation.router';
import { requestIdPropagationMiddleware } from './middlewares/request-id-propagation.middleware';
import { correlationMiddleware } from './middlewares/correlation.middleware';
import { responseFilterMiddleware } from './middlewares/response-filter.middleware';
import {
  optimizeResponsePayload,
  addResponseOptimizationHeaders,
} from './middleware/response-optimization.middleware';
import { parseLazyLoadQuery } from './middleware/lazy-load.middleware';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4000;

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

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 10kb per issue #351)
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? '10kb';

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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.options('*', cors());

// ── HTTP request logging with correlation ID ──────────────────────────────────
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
  })
);

// ── Request ID correlation & propagation ──────────────────────────────────────
// correlationMiddleware: stamps req.requestId and echoes X-Request-ID header
app.use(correlationMiddleware);
// requestIdPropagationMiddleware: stores the ID in AsyncLocalStorage for downstream services
app.use(requestIdPropagationMiddleware);

// ── Body parsing & sanitization ───────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: standardLimit }));
app.use(express.urlencoded({ extended: true, limit: standardLimit }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(requestAuditMiddleware);
app.use(mutationAuditMiddleware);
app.use(csrfMiddleware);

// ── Content-Type validation (issue #351) ──────────────────────────────────────
// Reject non-JSON bodies on mutating requests (POST/PUT/PATCH)
// Bypass for multipart/form-data routes (e.g. CSV import) and CSP violation reports
const MULTIPART_BYPASS = ['/api/v1/patients/import', '/api/v1/patients/'];
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] !== '0') {
    if (MULTIPART_BYPASS.some((p) => req.path.startsWith(p))) return next();
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
app.use('/health', healthRoutes);
app.use('/health', backupHealthRoutes);

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
app.use('/api/v1', v1DeprecationWarning);
app.use('/api/v1', apiVersionHeader('1.0'));
app.use('/api/v1', traceIdHeader);
app.use('/api/v1', generalLimiter);
// ── Request/Response optimization (#1075, #1076) ──────────────────────────────
// Parse ?fields= and ?excludeFields= query parameters for lazy loading & field selection
app.use('/api/v1', parseLazyLoadQuery);
// Strip role-restricted fields from JSON responses
app.use('/api/v1', responseFilterMiddleware);
// Add optimization metric headers and remove null/empty fields from JSON responses
app.use('/api/v1', addResponseOptimizationHeaders);
app.use(
  '/api/v1',
  optimizeResponsePayload({ enableMetrics: true, removeNullFields: true, removeEmptyArrays: true })
);
app.use('/api/v1', v1Router);

// ── V2 API Routes (current) ───────────────────────────────────────────────────
app.use('/api/v2', apiVersionHeader('2.0'));
app.use('/api/v2', traceIdHeader);
app.use('/api/v2', generalLimiter);
app.use('/api/v2', parseLazyLoadQuery);
app.use('/api/v2', responseFilterMiddleware);
app.use('/api/v2', addResponseOptimizationHeaders);
app.use(
  '/api/v2',
  optimizeResponsePayload({ enableMetrics: true, removeNullFields: true, removeEmptyArrays: true })
);
app.use('/api/v2', v2Router);

// ── Stellar federation (public, no auth) ──────────────────────────────────────
// Mounted at root level to comply with Stellar federation protocol standards
app.use('/.well-known', federationRouter);
app.use('/federation', federationRouter);

setupSwagger(app);

// ── 404 & global error handler ────────────────────────────────────────────────
app.use('*', (_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

export default app;

// ── Start server ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();

  // Seed built-in CDS rules
  await seedBuiltInRules();

  // Initialize Socket.IO service
  const socketService = SocketService.getInstance(server);
  logger.info('Socket.IO service initialized');

  server.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info('📡 Socket.IO server ready for real-time connections');
  });

  // Initialise Socket.IO on the same HTTP server
  initSocket(server);
  logger.info('Socket.IO initialised');

  startPaymentExpirationJob();
  startReconciliationJob();
  startRiskRecalculationJob();
  startBalanceMonitoringJob();
  startWaitlistExpiryJob();
  startAppointmentReminderJob();
  startClaimableExpiryNotificationJob();
  startXLMRateJob();
  initializeBackupMetrics().catch((err) =>
    logger.warn({ err }, 'Failed to load initial backup metrics')
  );
  startMfaGracePeriodJob();
  startFollowUpReminderJob();

  // Track MongoDB connection pool metrics for Prometheus
  setInterval(() => {
    const { totalConnections, waitQueueSize } = getPoolMetrics();
    mongodbConnectionPoolSize.set(totalConnections);
    mongodbPoolWaitQueueSize.set(waitQueueSize);
  }, 15_000);

  registerGracefulShutdown(server, {
    stopJobs: [
      stopPaymentExpirationJob,
      stopReconciliationJob,
      stopRiskRecalculationJob,
      stopBalanceMonitoringJob,
      stopWaitlistExpiryJob,
      stopAppointmentReminderJob,
      stopClaimableExpiryNotificationJob,
      stopXLMRateJob,
      stopMfaGracePeriodJob,
      stopFollowUpReminderJob,
    ],
  });
}

startServer();
