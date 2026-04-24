import './config/env'; // must be first — validates env vars

import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import { authRoutes } from './modules/auth/auth.controller';
import { userRoutes } from './modules/users/users.controller';
import { patientRoutes } from './modules/patients/patients.controller';
import { encounterRoutes } from './modules/encounters/encounters.controller';
import { encounterTemplateRoutes } from './modules/encounters/encounter-templates.controller';
import { paymentRoutes } from './modules/payments/payments.controller';
import { clinicRoutes } from './modules/clinics/clinics.controller';
import { webhookRoutes } from './modules/webhooks/webhooks.controller';
import { auditLogRoutes } from './modules/audit/audit-logs.controller';
import aiRoutes from './modules/ai/ai.routes';
import { setupSwagger } from './docs/swagger';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { errorHandler } from './middlewares/error.middleware';
import {
  authLimiter,
  forgotPasswordLimiter,
  aiLimiter,
  paymentLimiter,
  generalLimiter,
} from './middlewares/rate-limit.middleware';
import { appointmentRoutes } from './modules/appointments/appointments.controller';
import { labResultRoutes } from './modules/lab-results/lab-results.controller';
import { icd10Routes } from './modules/icd10/icd10.controller';
import { apiVersionHeader } from './middlewares/versioning.middleware';
import { clinicSettingsRoutes } from './modules/clinics/clinic-settings.controller';
import { notificationRoutes } from './modules/notifications/notifications.controller';
import { referralRoutes } from './modules/referrals/referrals.controller';
import { invoiceRoutes } from './modules/invoices/invoices.controller';
import {
  startPaymentExpirationJob,
  stopPaymentExpirationJob,
} from './modules/payments/services/payment-expiration-job';
import {
  startReconciliationJob,
  stopReconciliationJob,
} from './modules/payments/services/reconciliation-job';
import { getCacheMetrics } from './services/cache.service';
import { carePlanRoutes } from './modules/care-plans/care-plans.controller';
import { portalRoutes } from './modules/portal/portal.controller';
import { reportRoutes } from './modules/reports/reports.controller';
import { consentRoutes } from './modules/consent/consent.controller';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 4000;

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 10kb per issue #351)
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? '10kb';
// AI routes allow larger payloads for clinical notes (default 50kb per issue #351)
const aiLimit = process.env.AI_REQUEST_BODY_SIZE ?? '50kb';

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
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);
app.use(
  compression({
    level: 6,
    threshold: 1024, // only compress responses > 1KB
    filter: (req, res) => {
      // Skip already-compressed content types (images, PDFs, etc.)
      const contentType = res.getHeader('Content-Type') as string | undefined;
      if (contentType) {
        if (/^image\//i.test(contentType)) return false;
        if (contentType === 'application/pdf') return false;
        if (contentType === 'application/zip') return false;
      }
      return compression.filter(req, res);
    },
  }),
);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors());

// ── HTTP request logging with correlation ID ──────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    autoLogging: { ignore: (req) => isProd && req.url === '/health' },
    redact: ['req.headers.authorization'],
  })
);

// ── Body parsing & sanitization ───────────────────────────────────────────────
app.use(express.json({ limit: standardLimit }));
app.use(express.urlencoded({ extended: true, limit: standardLimit }));
app.use(mongoSanitize({ replaceWith: '_' }));

// ── Content-Type validation (issue #351) ──────────────────────────────────────
// Reject non-JSON bodies on mutating requests (POST/PUT/PATCH)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] !== '0') {
    if (!req.is('application/json') && !req.is('application/x-www-form-urlencoded')) {
      return res
        .status(415)
        .json({ error: 'UnsupportedMediaType', message: 'Content-Type must be application/json' });
    }
  }
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'health-watchers-api',
    timestamp: new Date().toISOString(),
    cache: getCacheMetrics(),
  })
);

// ── API version header on all /api/* responses ────────────────────────────────
app.use('/api', apiVersionHeader('1.0'));

// ── API versions endpoint ─────────────────────────────────────────────────────
app.get('/api/versions', (_req, res) =>
  res.json({
    versions: [
      {
        version: 'v1',
        status: 'current',
        baseUrl: '/api/v1',
        releaseDate: '2024-01-01',
      },
    ],
    current: 'v1',
  }),
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1', generalLimiter);
app.use('/api/v1/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/clinics', clinicRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/encounters', encounterRoutes);
app.use('/api/v1/encounter-templates', encounterTemplateRoutes);
app.use('/api/v1/payments', paymentLimiter, paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/ai', aiLimiter, express.json({ limit: aiLimit }), aiRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/icd10', icd10Routes);
app.use('/api/v1/lab-results', labResultRoutes);
app.use('/api/v1/settings', clinicSettingsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/care-plans', carePlanRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1', consentRoutes);

setupSwagger(app);

// ── 404 & global error handler ────────────────────────────────────────────────
app.use('*', (_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

export default app;

// ── Start server ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
  });

  startPaymentExpirationJob();
  startReconciliationJob();

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown`);

    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Stop payment expiration job
        stopPaymentExpirationJob();
        stopReconciliationJob();
        logger.info('Payment expiration job stopped');

        // Close database connection
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });

    // Force exit after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timeout (30s), forcing exit');
      process.exit(1);
    }, 30000);
  };

  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (err: unknown) => {
    logger.error({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled rejection');
    // Log but don't exit - let the process continue
  });
}

startServer();
