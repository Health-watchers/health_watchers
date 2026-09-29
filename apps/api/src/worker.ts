import './tracing'; // must be first — initialises OpenTelemetry SDK before any other import
import './instrument'; // must be first — initialises Sentry before any other module
import './config/env'; // must be second — validates env vars

import { connectDB } from './config/db';
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
import { registerGracefulShutdown } from './utils/graceful-shutdown';
import logger from './utils/logger';

/**
 * Worker Entry Point
 * 
 * This process runs background jobs separately from the HTTP API server,
 * allowing independent scaling based on queue depth and job load.
 * 
 * Jobs run by this worker:
 * - Payment expiration and reconciliation
 * - Patient risk recalculation
 * - Balance monitoring and alerts
 * - Waitlist expiry and appointment reminders
 * - Claimable balance notifications
 * - XLM exchange rate updates
 * - MFA grace period enforcement
 * - Document retention sweeps
 * - Webhook retry processing
 * - Follow-up encounter reminders
 * - Scheduled report generation
 * - API key lifecycle management
 * - Notification dispatch
 */

async function startWorker(): Promise<void> {
  try {
    logger.info('🔧 Starting Health Watchers Worker...');

    // Connect to database
    await connectDB();
    logger.info('✅ Database connected');

    // Start all background jobs
    logger.info('🚀 Starting background jobs...');
    
    startPaymentExpirationJob();
    startReconciliationJob();
    startRiskRecalculationJob();
    startBalanceMonitoringJob();
    startWaitlistExpiryJob();
    startAppointmentReminderJob();
    startClaimableExpiryNotificationJob();
    startXLMRateJob();
    startMfaGracePeriodJob();
    startFollowUpReminderJob();
    startRetryWorker();
    startRetentionSweepJob();
    startReportScheduleJob();
    startApiKeyLifecycleJob();
    startNotificationDispatchJob();

    logger.info('✅ All background jobs started successfully');

    // Register graceful shutdown handlers
    registerGracefulShutdown(async () => {
      logger.info('🛑 Stopping all background jobs...');
      
      stopPaymentExpirationJob();
      stopReconciliationJob();
      stopRiskRecalculationJob();
      stopBalanceMonitoringJob();
      stopWaitlistExpiryJob();
      stopAppointmentReminderJob();
      stopClaimableExpiryNotificationJob();
      stopXLMRateJob();
      stopMfaGracePeriodJob();
      stopFollowUpReminderJob();
      stopRetryWorker();
      stopRetentionSweepJob();
      stopReportScheduleJob();
      stopApiKeyLifecycleJob();
      stopNotificationDispatchJob();

      logger.info('✅ All jobs stopped gracefully');
    });

    logger.info('✅ Worker is running and processing jobs');
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to start worker');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection at Promise');
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception thrown');
  process.exit(1);
});

// Start the worker
startWorker().catch((error) => {
  logger.error({ err: error }, 'Fatal error during worker startup');
  process.exit(1);
});
