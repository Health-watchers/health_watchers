import { HydratedDocument, Types } from 'mongoose';
import logger from '@api/utils/logger';
import { emitToUser } from '@api/realtime/socket';
import { auditLog } from '../audit/audit.service';
import { UserModel } from '../auth/models/user.model';
import { NotificationModel, NotificationType } from './notification.model';
import {
  NotificationDeliveryModel,
  INotificationDelivery,
  DeliveryStatus,
} from './notification-delivery.model';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notification-template.model';
import { renderTemplate } from './notification-template.service';
import { getChannelAdapter } from './notification-channels';
import { resolveChannels } from './notification-preference.service';
import {
  recordNotificationAttempt,
  recordNotificationDelivery,
} from '@api/monitoring/custom-metrics';

const RETRY_BASE_MS = 60_000; // 1 minute
const RETRY_MAX_MS = 60 * 60_000; // 1 hour
const DEFAULT_MAX_ATTEMPTS = 5;

export interface DispatchInput {
  userId: string | Types.ObjectId;
  clinicId: string | Types.ObjectId;
  type: NotificationType | string;
  /** Channels to try; defaults to every channel, then filtered by preferences. */
  channels?: NotificationChannel[];
  /** Stored template key. When omitted, `title`/`message` are used verbatim. */
  templateKey?: string;
  locale?: string;
  /** Placeholder values for the template. */
  variables?: Record<string, unknown>;
  /** Used when no `templateKey` is given, or as the template fallback. */
  title?: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  /** Explicit recipient addresses per channel (overrides values derived from the user). */
  recipients?: Partial<Record<NotificationChannel, string>>;
  /** Hold every channel until this time. */
  scheduledFor?: Date;
  maxAttempts?: number;
}

export interface DispatchResult {
  notificationId?: string;
  deliveries: Array<{
    channel: NotificationChannel;
    deliveryId: string;
    status: DeliveryStatus;
  }>;
  suppressed: Array<{ channel: NotificationChannel; reason: string }>;
}

interface DerivedUser {
  email?: string;
  phone?: string;
  pushToken?: string;
}

function backoffDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

async function deriveRecipients(userId: string | Types.ObjectId): Promise<DerivedUser> {
  const user = await UserModel.findById(userId).lean<{
    email?: string;
    portalPhoneNumber?: string;
    deviceTokens?: string[];
  }>();
  return {
    email: user?.email,
    phone: user?.portalPhoneNumber,
    pushToken: user?.deviceTokens?.[0],
  };
}

function recipientFor(
  channel: NotificationChannel,
  input: DispatchInput,
  derived: DerivedUser
): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- `channel` is a NotificationChannel enum literal
  const explicit = input.recipients?.[channel];
  if (explicit) return explicit;
  switch (channel) {
    case 'in_app':
      return String(input.userId);
    case 'email':
      return derived.email;
    case 'sms':
      return derived.phone;
    case 'push':
      return derived.pushToken;
    default:
      return undefined;
  }
}

/**
 * Attempt a single delivery, mutating and saving the document. Shared by the
 * initial dispatch and the retry worker.
 */
export async function attemptDelivery(
  doc: HydratedDocument<INotificationDelivery>
): Promise<DeliveryStatus> {
  doc.attempts += 1;
  recordNotificationAttempt(doc.channel);

  const finish = async (): Promise<DeliveryStatus> => {
    await doc.save();
    recordNotificationDelivery(doc.channel, doc.status);
    return doc.status;
  };

  // in_app is delivered inline: write the Notification row + emit a socket event.
  if (doc.channel === 'in_app') {
    try {
      const notification =
        doc.notificationId ??
        (
          await NotificationModel.create({
            userId: doc.userId,
            clinicId: doc.clinicId,
            type: doc.type,
            title: (doc.metadata?.title as string) || 'Notification',
            message: (doc.metadata?.body as string) || '',
            link: doc.metadata?.link as string | undefined,
            metadata: doc.metadata,
          })
        )._id;
      doc.notificationId = notification as Types.ObjectId;
      doc.status = 'delivered';
      doc.sentAt = new Date();
      doc.deliveredAt = new Date();
      try {
        emitToUser(String(doc.userId), 'notification:new', {
          _id: String(notification),
          type: doc.type,
          title: doc.metadata?.title,
          message: doc.metadata?.body,
          link: doc.metadata?.link,
        });
      } catch {
        // socket not initialised (tests / worker context) — non-fatal
      }
      return finish();
    } catch (err) {
      doc.lastError = (err as Error).message;
    }
  } else {
    const adapter = getChannelAdapter(doc.channel);
    if (!adapter || !adapter.isConfigured()) {
      doc.status = 'skipped';
      doc.lastError = 'channel_not_configured';
      return finish();
    }
    const result = await adapter.send({
      channel: doc.channel,
      recipient: doc.recipient,
      subject: doc.metadata?.subject as string | undefined,
      body: (doc.metadata?.body as string) || '',
      type: doc.type,
      metadata: doc.metadata,
    });
    if (result.status === 'sent') {
      doc.status = 'sent';
      doc.sentAt = new Date();
      doc.providerMessageId = result.providerMessageId;
      doc.nextRetryAt = undefined;
      return finish();
    }
    doc.lastError = result.error;
  }

  // Failure path — schedule a retry or give up.
  if (doc.attempts >= doc.maxAttempts) {
    doc.status = 'failed';
    doc.failedAt = new Date();
    doc.nextRetryAt = undefined;
    logger.warn(
      { deliveryId: String(doc._id), channel: doc.channel, attempts: doc.attempts },
      '[notification-dispatch] delivery failed permanently'
    );
  } else {
    doc.status = 'pending';
    doc.nextRetryAt = new Date(Date.now() + backoffDelayMs(doc.attempts));
  }
  await doc.save();
  if (doc.status === 'failed') recordNotificationDelivery(doc.channel, doc.status);
  return doc.status;
}

/**
 * Fan a notification out across every eligible channel, honouring user
 * preferences and quiet hours, creating a per-channel delivery record and
 * attempting immediate delivery for channels that are not scheduled.
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const requested = input.channels?.length ? input.channels : [...NOTIFICATION_CHANNELS];
  const { channels, suppressed, deferUntil } = await resolveChannels({
    userId: input.userId,
    type: input.type,
    requestedChannels: requested,
  });

  const derived = await deriveRecipients(input.userId);
  const scheduledFor = input.scheduledFor ?? deferUntil;
  const deliveries: DispatchResult['deliveries'] = [];
  const allSuppressed = [...suppressed];

  for (const channel of channels) {
    const recipient = recipientFor(channel, input, derived);
    if (!recipient) {
      allSuppressed.push({ channel, reason: 'no_recipient' });
      continue;
    }

    let subject = input.title;
    let body = input.message ?? '';
    if (input.templateKey) {
      const rendered = await renderTemplate({
        key: input.templateKey,
        channel,
        locale: input.locale,
        clinicId: input.clinicId,
        variables: input.variables,
        fallback:
          input.message !== undefined ? { subject: input.title, body: input.message } : undefined,
      });
      subject = rendered.subject ?? subject;
      body = rendered.body;
    }

    const delivery = await NotificationDeliveryModel.create({
      userId: input.userId,
      clinicId: input.clinicId,
      type: input.type,
      channel,
      recipient,
      status: 'pending',
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      scheduledFor: scheduledFor && scheduledFor.getTime() > Date.now() ? scheduledFor : undefined,
      metadata: {
        title: subject,
        subject,
        body,
        link: input.link,
        ...input.metadata,
      },
    });

    let status: DeliveryStatus = 'pending';
    if (!delivery.scheduledFor) {
      status = await attemptDelivery(delivery);
    }
    deliveries.push({ channel, deliveryId: String(delivery._id), status });
  }

  const inAppDelivery = deliveries.find((d) => d.channel === 'in_app');
  let notificationId: string | undefined;
  if (inAppDelivery) {
    const fresh = await NotificationDeliveryModel.findById(inAppDelivery.deliveryId)
      .select('notificationId')
      .lean<{ notificationId?: Types.ObjectId }>();
    notificationId = fresh?.notificationId ? String(fresh.notificationId) : undefined;
  }

  await auditLog({
    userId: input.userId,
    clinicId: input.clinicId,
    action: 'NOTIFICATION_DISPATCH',
    resourceType: 'Notification',
    resourceId: notificationId,
    outcome: 'SUCCESS',
    metadata: {
      type: input.type,
      channels: deliveries.map((d) => d.channel),
      suppressed: allSuppressed,
      scheduled: Boolean(scheduledFor),
    },
  });

  return { notificationId, deliveries, suppressed: allSuppressed };
}
