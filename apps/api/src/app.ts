import './config/env'; // must be first — validates all required env vars before anything else
import express from 'express';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import { connectDB } from './config/db';
import { authRoutes } from './modules/auth/auth.controller';
import { userRoutes } from './modules/users/users.controller';
import { patientRoutes } from './modules/patients/patients.controller';
import { encounterRoutes } from './modules/encounters/encounters.controller';
import { paymentRoutes } from './modules/payments/payments.controller';
import { webhookRoutes } from './modules/webhooks/webhooks.controller';
import { auditLogRoutes } from './modules/audit/audit-logs.controller';
import aiRoutes from './modules/ai/ai.routes';
import { setupSwagger } from './docs/swagger';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { errorHandler } from './middlewares/error.middleware';
import { appointmentRoutes } from './modules/appointments/appointments.controller';
import {
  startPaymentExpirationJob,
  stopPaymentExpirationJob,
} from './modules/payments/services/payment-expiration-job';
import logger from './utils/logger';

const app = express();
app.disable('x-powered-by');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    credentials: true,
  }),
);

app.options('*', cors());

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 50kb)
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? '50kb';
// AI routes allow larger payloads for summarization (default 500kb)
const aiLimit = process.env.AI_REQUEST_BODY_SIZE ?? '500kb';

app.use(express.json({ limit: standardLimit }));

// Sanitize req.body, req.query, req.params — replace $ and . to block NoSQL injection
app.use(mongoSanitize({ replaceWith: '_' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'health-watchers-api' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/encounters', encounterRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
// Override limit for AI routes
app.use('/api/v1/ai', express.json({ limit: aiLimit }), aiRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/appointments', appointmentRoutes);

setupSwagger(app);

// Global error handler — must be last
app.use(errorHandler);

async function start() {
  try {
    await connectDB();

    // Start background jobs
    startPaymentExpirationJob();

    const server = app.listen(config.apiPort, () => {
      logger.info(`Health Watchers API running on port ${config.apiPort}`);
    });

    const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000);

    async function shutdown(signal: string) {
      logger.info({ signal }, 'Shutting down gracefully...');

      // Stop background jobs
      stopPaymentExpirationJob();

      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await mongoose.disconnect();
          logger.info('MongoDB connection closed');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error closing MongoDB connection');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Shutdown timeout exceeded — forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start API');
    process.exit(1);
  }
}

start();

export default app;
