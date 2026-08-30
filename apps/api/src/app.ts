import './tracing'; // must be first — initialises OpenTelemetry SDK before any other import
import './instrument'; // must be first — initialises Sentry before any other module
import './config/env'; // must be second — validates env vars

import crypto from 'crypto';
import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
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
import { rateLimitMonitor } from './middlewares/rate-limit-monitor.middleware';
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
  startRetentionSweepJob,
  stopRetentionSweepJob,
} from './modules/documents/document-retention.service';
import { startRetryWorker, stopRetryWorker } from './modules/webhooks/retry-worker';
import {
  startFollowUpReminderJob,
  stopFollowUpReminderJob,
} from './modules/encounters/follow-up-reminder-job';
import {
  startReportScheduleJob,
  stopReportScheduleJob,
} from './modules/reports/analytics/report-schedule-job';
import {
  startApiKeyLifecycleJob,
  stopApiKeyLifecycleJob,
} from './modules/api-keys/api-key-lifecycle-job';
import {
  startNotificationDispatchJob,
  stopNotificationDispatchJob,
} from './modules/notifications/notification-dispatch-job';
import { warmCache, registerWarmup } from './services/cache.service';

// ── #1071 Cache warm-up registrations ─────────────────────────────────────────
// Register a loader for the first page of active patients per clinic.
// warmCache() is called after DB connects in startServer(); until then only
// the registry is populated (no DB access here at module load time).
// Individual clinic registrations happen inside startServer() once the DB
// pool is ready and the clinic list is available.

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
import { migrationStatusRouter } from './modules/migrations/migration-status.controller';
import { errorAnalyticsRouter } from './modules/monitoring/error-analytics.controller';
import { rateLimitConfigRouter } from './modules/rate-limiting/rate-limit-config.controller';
import { cacheDebugRouter } from './modules/caching/cache-debug.controller';
import { errorAnalytics } from './services/error-analytics.service';
import { migrationManager } from './services/migration-manager.service';

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
app.use('/api/v1', rateLimitMonitor);
app.use('/api/v1', generalLimiter);
app.use('/api/v1', responseFilterMiddleware);
app.use('/api/v1', v1Router);

// ── V2 API Routes (current) ───────────────────────────────────────────────────
app.use('/api/v2', apiVersionHeader('2.0'));
app.use('/api/v2', traceIdHeader);
app.use('/api/v2', rateLimitMonitor);
app.use('/api/v2', generalLimiter);
app.use('/api/v2', responseFilterMiddleware);
app.use('/api/v2', v2Router);

// ── Stellar federation (public, no auth) ──────────────────────────────────────
// Mounted at root level to comply with Stellar federation protocol standards
app.use('/.well-known', federationRouter);
app.use('/federation', federationRouter);

// ── Admin monitoring & management endpoints ───────────────────────────────────
app.use('/api/v2', migrationStatusRouter);
app.use('/api/v2', errorAnalyticsRouter);
app.use('/api/v2', rateLimitConfigRouter);
app.use('/api/v2', cacheDebugRouter);

setupSwagger(app);

// ── 404 & global error handler ────────────────────────────────────────────────
app.use('*', (_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

export default app;

// ── Start server ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();

  // Initialize migration manager
  try {
    migrationManager.setDatabase(mongoose.connection.db as any);
    await migrationManager.initialize();
    logger.info('[migration-manager] Initialized successfully');
  } catch (err) {
    logger.warn(
      { err },
      '[migration-manager] Initialization failed, continuing without migration tracking'
    );
  }

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
  startRetryWorker();
  startRetentionSweepJob();
  startNotificationDispatchJob();

  // #1071 — Register per-clinic patient-list cache warmup entries now that the
  // DB pool is ready, then warm all registered keys that are currently cold.
  try {
    const { PatientModel } = await import('./modules/patients/models/patient.model');
    const { ClinicModel } = await import('./modules/clinics/clinic.model');
    const activeClinics = await ClinicModel.find({ isActive: true }).select('_id').lean();
    for (const clinic of activeClinics) {
      const clinicId = String(clinic._id);
      registerWarmup({
        key: `patients:list:${clinicId}:page=1:limit=20`,
        ttlSeconds: 60,
        loader: async () => {
          const { paginate } = await import('./utils/paginate');
          const { toPatientResponse } = await import('./modules/patients/patients.transformer');
          const result = await paginate(
            PatientModel,
            { clinicId, isActive: true },
            1,
            20,
            { createdAt: -1 },
            {
              projection: {
                systemId: 1,
                firstName: 1,
                lastName: 1,
                searchName: 1,
                dateOfBirth: 1,
                sex: 1,
                contactNumber: 1,
                clinicId: 1,
                isActive: 1,
                riskLevel: 1,
                riskScore: 1,
                createdAt: 1,
              },
              hint: 'clinicId_1_isActive_1',
            }
          );
          return { data: result.data.map(toPatientResponse), pagination: result.meta };
        },
      });
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
      stopRetryWorker,
      stopRetentionSweepJob,
      stopNotificationDispatchJob,
    ],
  });
}

startServer();
