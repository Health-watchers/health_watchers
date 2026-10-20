import logger from '@api/utils/logger';
import { NotificationDeliveryModel } from './notification-delivery.model';
import { attemptDelivery } from './notification-dispatch.service';
import { setNotificationRetryQueueDepth } from '@api/monitoring/custom-metrics';

/**
 * Background worker for notification delivery (#1250):
 *   - releases scheduled deliveries once their `scheduledFor` time passes
 *   - retries failed deliveries whose `nextRetryAt` is due (exponential backoff)
 *
 * Scheduled through the JobRegistry (`notification-dispatch`, every 30s).
 */
const BATCH_SIZE = 200;

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
