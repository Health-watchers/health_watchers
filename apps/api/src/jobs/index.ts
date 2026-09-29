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
import { processDueReportSchedules } from '@api/modules/reports/analytics/report-schedule-job';
import { sweepApiKeyLifecycle } from '@api/modules/api-keys/api-key-lifecycle-job';
import { processDueDeliveries } from '@api/modules/notifications/notification-dispatch-job';
import { runImmunizationComplianceJob } from '@api/modules/immunizations/immunization-compliance-job';

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
