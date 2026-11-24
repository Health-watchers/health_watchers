import axios from 'axios';
import nodemailer, { Transporter } from 'nodemailer';
import logger from '@api/utils/logger';
import { NotificationChannel } from './notification-template.model';

/**
 * Pluggable outbound delivery adapters (#1250).
 *
 * Each adapter owns one channel and degrades gracefully: when the provider is
 * not configured `isConfigured()` returns `false` and the dispatch service marks
 * the delivery `skipped` instead of failing it. Real providers (SMTP, Twilio,
 * FCM) are used automatically once their environment variables are present.
 *
 * The `in_app` channel is handled directly by the dispatch service (it writes a
 * Notification document and emits a socket event) and has no adapter here.
 */
export interface OutboundMessage {
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelSendResult {
  status: 'sent' | 'failed';
  providerMessageId?: string;
  error?: string;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<ChannelSendResult>;
}

// ── Email (SMTP via nodemailer) ──────────────────────────────────────────────
let sharedTransporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!sharedTransporter) {
    sharedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_PORT === '465',
      auth: process.env.EMAIL_USER
        ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        : undefined,
    });
  }
  return sharedTransporter;
}

export const emailAdapter: NotificationChannelAdapter = {
  channel: 'email',
  isConfigured: () => Boolean(process.env.EMAIL_HOST),
  async send(message) {
    try {
      const info = await getTransporter().sendMail({
        from: `"Health Watchers" <${process.env.EMAIL_FROM || 'noreply@healthwatchers.com'}>`,
        to: message.recipient,
        subject: message.subject || 'Notification',
        text: message.body,
      });
      return { status: 'sent', providerMessageId: info.messageId };
    } catch (err) {
      return { status: 'failed', error: (err as Error).message };
    }
  },
};

// ── SMS (Twilio REST API) ────────────────────────────────────────────────────
export const smsAdapter: NotificationChannelAdapter = {
  channel: 'sms',
  isConfigured: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM
    ),
  async send(message) {
    const sid = process.env.TWILIO_ACCOUNT_SID as string;
    const token = process.env.TWILIO_AUTH_TOKEN as string;
    try {
      const res = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        new URLSearchParams({
          To: message.recipient,
          From: process.env.TWILIO_SMS_FROM as string,
          Body: message.body,
        }),
        {
          auth: { username: sid, password: token },
          timeout: 10_000,
        }
      );
      return { status: 'sent', providerMessageId: res.data?.sid };
    } catch (err) {
      const detail =
        (axios.isAxiosError(err) && err.response?.data?.message) || (err as Error).message;
      return { status: 'failed', error: String(detail) };
    }
  },
};

// ── Push (Firebase Cloud Messaging legacy HTTP API) ──────────────────────────
export const pushAdapter: NotificationChannelAdapter = {
  channel: 'push',
  isConfigured: () => Boolean(process.env.FCM_SERVER_KEY),
  async send(message) {
    try {
      const res = await axios.post(
        'https://fcm.googleapis.com/fcm/send',
        {
          to: message.recipient,
          notification: { title: message.subject || 'Health Watchers', body: message.body },
          data: { type: message.type, ...(message.metadata ?? {}) },
        },
        {
          headers: {
            Authorization: `key=${process.env.FCM_SERVER_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        }
      );
      const ok = (res.data?.success ?? 0) >= 1;
      return ok
        ? { status: 'sent', providerMessageId: res.data?.multicast_id?.toString() }
        : { status: 'failed', error: JSON.stringify(res.data?.results ?? res.data) };
    } catch (err) {
      return { status: 'failed', error: (err as Error).message };
    }
  },
};

const registry: Partial<Record<NotificationChannel, NotificationChannelAdapter>> = {
  email: emailAdapter,
  sms: smsAdapter,
  push: pushAdapter,
};

/** Replace an adapter (used by tests and by clinics wiring their own providers). */
export function registerChannelAdapter(adapter: NotificationChannelAdapter): void {
  registry[adapter.channel] = adapter;
  logger.info({ channel: adapter.channel }, '[notification-channels] adapter registered');
}

export function getChannelAdapter(
  channel: NotificationChannel
): NotificationChannelAdapter | undefined {
  // eslint-disable-next-line security/detect-object-injection -- `channel` is a NotificationChannel enum literal
  return registry[channel];
}
