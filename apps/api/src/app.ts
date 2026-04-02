import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import { connectDB } from './config/db';
import { authRoutes } from './modules/auth/auth.controller';
import { userRoutes } from './modules/users/users.controller';
import { patientRoutes } from './modules/patients/patients.controller';
import { encounterRoutes } from './modules/encounters/encounters.controller';
import { paymentRoutes } from './modules/payments/payments.controller';
import { clinicRoutes } from './modules/clinics/clinics.controller';
import { webhookRoutes } from './modules/webhooks/webhooks.controller';
import { auditLogRoutes } from './modules/audit/audit-logs.controller';
import aiRoutes from './modules/ai/ai.routes';
import exportRoutes from './modules/export/export.routes';
import { setupSwagger } from './docs/swagger';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { errorHandler } from './middlewares/error.middleware';
import { authLimiter, generalLimiter } from './middlewares/rate-limit.middleware';
import { appointmentRoutes } from './modules/appointments/appointments.controller';
import {
  startPaymentExpirationJob,
  stopPaymentExpirationJob,
} from './modules/payments/services/payment-expiration-job';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 4000;

// ========================
// SECURITY & PERFORMANCE MIDDLEWARE
// ========================

// 1. Helmet (Security) - First
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    credentials: true,
  }),
);

app.options('*', cors());

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 50kb)
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? '50kb';
// AI routes allow larger payloads for summarization (default 500kb)
const aiLimit = process.env.AI_REQUEST_BODY_SIZE ?? '500kb';

// ========================
// HTTP REQUEST LOGGING
// ========================

// 4. Morgan - HTTP request logger
// Route output through the structured pino logger
const morganStream = {
  write: (message: string) => logger.info(message.trimEnd()),
};

const isProd = process.env.NODE_ENV === 'production';

// In production, skip /health to reduce noise
const skipHealthInProd = (req: express.Request) =>
  isProd && req.path === '/health';

app.use(
  morgan(isProd ? 'combined' : 'dev', {
    stream: morganStream,
    skip: skipHealthInProd,
  }),
);

app.use(express.json({ limit: standardLimit }));

// Sanitize req.body, req.query, req.params — replace $ and . to block NoSQL injection
app.use(mongoSanitize({ replaceWith: '_' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'health-watchers-api' }));

// Apply general rate limiter to all API routes
app.use('/api/v1', generalLimiter);

// Apply strict rate limiter to auth routes (login + refresh brute-force protection)
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/clinics', clinicRoutes);
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
app.use('/api/v1', exportRoutes);

setupSwagger(app);

// Global error handler — must be last
app.use(errorHandler);

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ========================
// START SERVER
// ========================
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT} with gzip compression enabled`);
  });
};

process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Rejection:', err.message);
  process.exit(1);
});

startServer();