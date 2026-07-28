import logger from '@api/utils/logger';
import { WebhookModel, WebhookEventLogModel } from './webhook.model';
import { enqueueWebhookDelivery } from './webhook.service';

export type WebhookEventType =
  | 'payment.confirmed'
  | 'payment.failed'
  | 'appointment.created'
  | 'appointment.cancelled'
  | 'patient.created'
  | 'patient.updated'
  | 'encounter.created'
  | 'encounter.updated'
  | 'lab_result.created'
  | 'lab_result.updated'
  | 'referral.created'
  | 'referral.completed'
  | 'immunization.recorded'
  | 'care_plan.created'
  | 'care_plan.updated'
  | 'consent.granted'
  | 'consent.revoked'
  | 'notification.created'
  | 'invoice.created'
  | 'invoice.paid';

export interface DispatchOptions {
  clinicId: string;
  event: WebhookEventType;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

interface EventFilter {
  include?: string[];
  exclude?: string[];
}

const eventFilters = new Map<string, EventFilter>();

export function registerEventFilter(clinicId: string, filter: EventFilter): void {
  eventFilters.set(clinicId, filter);
}

export function removeEventFilter(clinicId: string): void {
  eventFilters.delete(clinicId);
}

function shouldDispatch(clinicId: string, event: string): boolean {
  const filter = eventFilters.get(clinicId);
  if (!filter) return true;

  if (filter.exclude && filter.exclude.includes(event)) return false;
  if (filter.include && !filter.include.includes(event)) return false;
  return true;
}

export async function dispatchWebhookEvent(
  options: DispatchOptions
): Promise<void>;
export async function dispatchWebhookEvent(
  clinicId: string,
  event: string,
  data: Record<string, any>
): Promise<void>;
export async function dispatchWebhookEvent(
  clinicIdOrOptions: string | DispatchOptions,
  event?: string,
  data?: Record<string, any>
): Promise<void> {
  let clinicId: string;
  let eventType: string;
  let payload: Record<string, any>;
  let metadata: Record<string, any> | undefined;

  if (typeof clinicIdOrOptions === 'object') {
    ({ clinicId, event: eventType, data: payload, metadata } = clinicIdOrOptions);
  } else {
    clinicId = clinicIdOrOptions;
    eventType = event!;
    payload = data!;
  }

  if (!shouldDispatch(clinicId, eventType)) {
    logger.debug({ clinicId, event: eventType }, 'Webhook event skipped by filter');
    return;
  }

  const webhooks = await WebhookModel.find({
    clinicId,
    events: eventType,
    isActive: true,
  });

  if (webhooks.length === 0) {
    logger.debug({ clinicId, event: eventType }, 'No active webhooks for event');
    return;
  }

  const eventPayload = {
    event: eventType,
    data: payload,
    ...(metadata ? { metadata } : {}),
    timestamp: new Date().toISOString(),
  };

  const logEntries = await Promise.allSettled(
    webhooks.map(async (wh) => {
      const delivery = await enqueueWebhookDelivery(
        String(wh._id),
        eventType,
        wh.url,
        wh.secret,
        eventPayload
      );

      await WebhookEventLogModel.create({
        clinicId,
        webhookId: wh._id,
        event: eventType,
        payload: eventPayload,
        status: 'dispatched',
        deliveryId: delivery?._id,
      });

      return String(wh._id);
    })
  );

  const succeeded = logEntries.filter((r) => r.status === 'fulfilled').length;
  const failed = logEntries.filter((r) => r.status === 'rejected').length;

  logger.info(
    { clinicId, event: eventType, total: webhooks.length, succeeded, failed },
    'Webhook event dispatched'
  );
}

export async function dispatchBulkEvents(
  events: DispatchOptions[]
): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await dispatchWebhookEvent(event);
      dispatched++;
    } catch (error) {
      failed++;
      logger.error({ event: event.event, clinicId: event.clinicId, error }, 'Failed to dispatch webhook event');
    }
  }

  return { dispatched, failed };
}
