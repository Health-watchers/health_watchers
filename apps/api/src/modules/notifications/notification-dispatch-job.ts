import logger from '@api/utils/logger';
import { NotificationDeliveryModel } from './notification-delivery.model';
import { attemptDelivery } from './notification-dispatch.service';
import { setNotificationRetryQueueDepth } from '@api/monitoring/custom-metrics';

/**
 * Background worker for notification delivery (#1250):
 *   - releases scheduled deliveries once their `scheduledFor` time passes
 *   - retries failed deliveries whose `nextRetryAt` is due (exponential backoff)
 *
 * Runs on a fixed interval, mirroring the other jobs wired up in app.ts.
 */
export const CHECK_INTERVAL_MS = 30_000;
const BATCH_SIZE = 200;

let jobInterval: NodeJS.Timeout | null = null;

export async function processDueDeliveries(now = new Date()): Promise<number> {
  const due = await NotificationDeliveryModel.find({
    status: 'pending',
    $or: [
      { scheduledFor: { $lte: now } },
      { nextRetryAt: { $lte: now } },
      { scheduledFor: { $exists: false }, nextRetryAt: { $exists: false }, attempts: 0 },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(BATCH_SIZE);

  let processed = 0;
  for (const delivery of due) {
    try {
      await attemptDelivery(delivery);
      processed += 1;
    } catch (err) {
      logger.error(
        { err, deliveryId: String(delivery._id) },
        '[notification-dispatch-job] delivery attempt threw'
      );
    }
  }

  if (processed > 0) {
    logger.info({ processed }, '[notification-dispatch-job] processed due deliveries');
  }

  try {
    const pending = await NotificationDeliveryModel.countDocuments({ status: 'pending' });
    setNotificationRetryQueueDepth(pending);
  } catch {
    // metric refresh is best-effort
  }

  return processed;
}

export function startNotificationDispatchJob(): void {
  if (jobInterval) {
    logger.warn('[notification-dispatch-job] already running');
    return;
  }
  logger.info(`[notification-dispatch-job] starting (interval=${CHECK_INTERVAL_MS / 1000}s)`);
  processDueDeliveries().catch((err) =>
    logger.error({ err }, '[notification-dispatch-job] initial run failed')
  );
  jobInterval = setInterval(() => {
    processDueDeliveries().catch((err) =>
      logger.error({ err }, '[notification-dispatch-job] tick failed')
    );
  }, CHECK_INTERVAL_MS);
}

export function stopNotificationDispatchJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info('[notification-dispatch-job] stopped');
  }
}

export function isNotificationDispatchJobRunning(): boolean {
  return jobInterval !== null;
}
