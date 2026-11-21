/**
 * Registers every background job with the distributed JobRegistry (#1433).
 *
 * Default cron patterns reproduce the intervals the jobs previously ran at
 * with `setInterval`. Each can be overridden with `JOB_<NAME>_CRON` or turned
 * off with `JOB_<NAME>_ENABLED=false` — e.g. `JOB_XLM_RATE_CRON="*\/10 * * * *"`.
 */
import { jobRegistry, JobDefinition } from './job-registry';
import { runExpirationJobTick } from '@api/modules/payments/services/payment-expiration-job';
import { reconcileStalePending } from '@api/modules/payments/services/reconciliation-job';
import { runRiskRecalculation } from '@api/modules/patients/risk-recalculation-job';
import { runBalanceMonitoring } from '@api/modules/payments/services/balance-monitoring-job';
import { expireWaitlistEntries } from '@api/modules/appointments/waitlist-expiry-job';
import { sendAppointmentReminders } from '@api/modules/appointments/appointment-reminder-job';
import { sendClaimableExpiryNotifications } from '@api/modules/payments/services/claimable-expiry-notification-job';
import { runRateJobTick } from '@api/modules/payments/services/xlm-rate-job';
import { runMfaGracePeriodReminderTick } from '@api/modules/auth/mfa-grace-period-job';
import { runRetentionSweep } from '@api/modules/documents/document-retention.service';
import { processDueWebhookRetries } from '@api/modules/webhooks/retry-worker';
import { sendFollowUpReminders } from '@api/modules/encounters/follow-up-reminder-job';
import { runMultisigExpiryJob } from '@api/modules/payments/services/multisig-expiry-job';
import { processDueTranscriptions } from '@api/modules/ai/transcription-queue';
import { processDueReportSchedules } from '@api/modules/reports/analytics/report-schedule-job';
import { sweepApiKeyLifecycle } from '@api/modules/api-keys/api-key-lifecycle-job';
import { processDueDeliveries } from '@api/modules/notifications/notification-dispatch-job';
import { runImmunizationComplianceJob } from '@api/modules/immunizations/immunization-compliance-job';
import { relayPendingOutboxEvents } from '@api/modules/outbox/outbox.relay';
import { anchorChainHeads, verifyAllChains } from '@api/modules/audit/audit-chain.service';
import { processRecurringPayments } from '@api/modules/payments/recurring-payment-scheduler';
import { processDuePaymentRetries } from '@api/modules/payments/services/payment-retry.service';
import { processDueExports } from '@api/modules/export/export-scheduler.service';
import { runAgingReminders } from '@api/modules/billing/billing-aging';
import { sendSurveyAssignmentNotifications } from '@api/modules/surveys/survey-assignment-notification-job';
import { sendTrialExpiryNotifications } from '@api/modules/subscriptions/subscription-trial-expiry-job';
import { runCacheWarmupJob } from '@api/jobs/handlers/cache-warmup.job';

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: 'payment-expiration',
    cron: '*/5 * * * *',
    description: 'Expire pending payments past their expiresAt',
    handler: runExpirationJobTick,
  },
  {
    name: 'reconciliation',
    cron: '0 * * * *',
    description: 'Reconcile stale pending payments against Horizon',
    handler: reconcileStalePending,
  },
  {
    name: 'risk-recalculation',
    cron: '0 3 * * 0',
    description: 'Weekly patient risk score recalculation',
    handler: runRiskRecalculation,
  },
  {
    name: 'balance-monitoring',
    cron: '*/15 * * * *',
    description: 'Check clinic Stellar balances and alert on low balance',
    handler: runBalanceMonitoring,
  },
  {
    name: 'waitlist-expiry',
    cron: '*/15 * * * *',
    description: 'Expire notified waitlist entries whose response window passed',
    handler: expireWaitlistEntries,
  },
  {
    name: 'appointment-reminder',
    cron: '*/15 * * * *',
    description: 'Send 24h and 1h appointment reminders',
    handler: sendAppointmentReminders,
  },
  {
    name: 'claimable-expiry-notification',
    cron: '0 * * * *',
    description: 'Notify patients about claimable balances expiring within 24h',
    handler: sendClaimableExpiryNotifications,
  },
  {
    name: 'xlm-rate',
    cron: '*/5 * * * *',
    description: 'Refresh the XLM/USD exchange rate',
    handler: runRateJobTick,
  },
  {
    name: 'mfa-grace-period',
    cron: '0 0 * * *',
    description: 'Remind staff whose MFA grace period is about to end',
    handler: runMfaGracePeriodReminderTick,
  },
  {
    name: 'follow-up-reminder',
    cron: '0 8 * * *',
    description: 'Send follow-up encounter reminders',
    handler: sendFollowUpReminders,
  },
  {
    name: 'multisig-expiry',
    cron: '*/5 * * * *',
    description: 'Auto-void multi-sig payments that gathered no signatures within 24h',
    handler: runMultisigExpiryJob,
  },
  {
    name: 'transcription-processing',
    cron: '*/1 * * * *',
    description: 'Process queued encounter audio transcriptions',
    handler: () => processDueTranscriptions(),
  },
  {
    name: 'webhook-retry',
    cron: '*/30 * * * * *',
    description: 'Retry failed outbound webhook deliveries',
    handler: processDueWebhookRetries,
  },
  {
    name: 'document-retention',
    cron: '0 */6 * * *',
    description: 'Apply document retention policies',
    handler: () => runRetentionSweep(),
  },
  {
    name: 'report-schedule',
    cron: '* * * * *',
    description: 'Run scheduled analytics reports that are due',
    handler: () => processDueReportSchedules(),
  },
  {
    name: 'api-key-lifecycle',
    cron: '0 * * * *',
    description: 'Deactivate expired API keys and clear rotation grace windows',
    handler: () => sweepApiKeyLifecycle(),
  },
  {
    name: 'notification-dispatch',
    cron: '*/30 * * * * *',
    description: 'Deliver scheduled notifications and retry failed ones',
    handler: () => processDueDeliveries(),
  },
  {
    name: 'immunization-compliance',
    cron: '0 2 * * *',
    description: 'Flag overdue immunizations for every active clinic',
    handler: runImmunizationComplianceJob,
  },
  {
    name: 'outbox-relay',
    cron: '*/5 * * * * *',
    description: 'Deliver pending transactional outbox events (#1432)',
    handler: () => relayPendingOutboxEvents(),
  },
  {
    name: 'audit-chain-verify',
    cron: '0 2 * * *',
    description: 'Verify audit log hash chains and alert on tampering (#1494)',
    handler: () => verifyAllChains(),
  },
  {
    name: 'audit-chain-anchor',
    cron: '30 0 * * *',
    description: 'Anchor daily audit chain heads on Stellar when enabled (#1494)',
    handler: () => anchorChainHeads(),
  },
  {
    name: 'recurring-payments',
    cron: '0 1 * * *',
    description: 'Charge due recurring payment subscriptions exactly once per billing period (#1793)',
    handler: () => processRecurringPayments(),
    idempotencyKey: (scheduledFor: Date) => `recurring-payments:${scheduledFor.toISOString().slice(0, 10)}`,
  },
  {
    name: 'payment-retry',
    cron: '*/5 * * * *',
    description: 'Retry failed payments whose backoff window has elapsed (#1793)',
    handler: () => processDuePaymentRetries(),
    idempotencyKey: (scheduledFor: Date) => `payment-retry:${scheduledFor.toISOString().slice(0, 16)}`,
  },
  {
    name: 'export-scheduler',
    cron: '* * * * *',
    description: 'Run scheduled data exports that are due (#1793)',
    handler: () => processDueExports(),
    idempotencyKey: (scheduledFor: Date) => `export-scheduler:${scheduledFor.toISOString().slice(0, 16)}`,
  },
  {
    name: 'billing-aging-reminders',
    cron: '0 9 * * *',
    description: 'Send 30/60/90-day overdue invoice reminders, skipping overridden entries (#1684)',
    handler: () => runAgingReminders(),
    idempotencyKey: (scheduledFor: Date) => `billing-aging-reminders:${scheduledFor.toISOString().slice(0, 10)}`,
  },
  {
    name: 'survey-assignment-notifications',
    cron: '0 * * * *',
    description: 'Notify patients of newly assigned surveys (#1683)',
    handler: () => sendSurveyAssignmentNotifications(),
    idempotencyKey: (scheduledFor: Date) => `survey-assignment-notifications:${scheduledFor.toISOString().slice(0, 13)}`,
  },
  {
    name: 'subscription-trial-expiry',
    cron: '0 8 * * *',
    description: 'Send subscription trial-expiry notifications (#1682)',
    handler: () => sendTrialExpiryNotifications(),
    idempotencyKey: (scheduledFor: Date) => `subscription-trial-expiry:${scheduledFor.toISOString().slice(0, 10)}`,
  },
  {
    name: 'cache-warmup',
    cron: '0 4 * * *',
    description: 'Warm the Redis cache for recently active clinics once per deploy (#1803)',
    handler: () => runCacheWarmupJob(),
    idempotencyKey: (scheduledFor: Date) => `cache-warmup:${scheduledFor.toISOString().slice(0, 10)}`,
  },
];

let registered = false;

/** Register all jobs once, then start the scheduler for this process. */
export async function startJobScheduler(): Promise<void> {
  // app.ts starts the server on import; keep test runs from connecting to Redis.
  if (process.env.NODE_ENV === 'test' && process.env.JOBS_ENABLED !== 'true') return;
  if (!registered) {
    for (const def of JOB_DEFINITIONS) jobRegistry.register(def);
    registered = true;
  }
  await jobRegistry.start();
}

export async function stopJobScheduler(): Promise<void> {
  await jobRegistry.stop();
}

export { jobRegistry };