/**
 * Custom application metrics (#1257).
 *
 * Domain-specific Prometheus series for the notification and telehealth
 * subsystems, registered on the same registry that backs `GET /metrics`
 * (`services/metrics.service`). Import the `record*` helpers rather than the raw
 * metrics so call sites stay declarative.
 */
import client from 'prom-client';
import { register } from '../services/metrics.service';

function counter(config: client.CounterConfiguration<string>): client.Counter<string> {
  return (
    (register.getSingleMetric(config.name) as client.Counter<string> | undefined) ??
    new client.Counter({ ...config, registers: [register] })
  );
}

function gauge(config: client.GaugeConfiguration<string>): client.Gauge<string> {
  return (
    (register.getSingleMetric(config.name) as client.Gauge<string> | undefined) ??
    new client.Gauge({ ...config, registers: [register] })
  );
}

// ── Notifications (#1250) ───────────────────────────────────────────────────
export const notificationDeliveriesTotal = counter({
  name: 'notification_deliveries_total',
  help: 'Notification deliveries by channel and terminal status',
  labelNames: ['channel', 'status'],
});

export const notificationDeliveryAttemptsTotal = counter({
  name: 'notification_delivery_attempts_total',
  help: 'Individual notification delivery attempts by channel',
  labelNames: ['channel'],
});

export const notificationRetryQueueDepth = gauge({
  name: 'notification_retry_queue_depth',
  help: 'Number of notification deliveries pending retry or scheduled send',
});

// ── Telehealth (#1249) ─────────────────────────────────────────────────────
export const telehealthSessionsTotal = counter({
  name: 'telehealth_sessions_total',
  help: 'Telehealth session lifecycle transitions',
  labelNames: ['event'],
});

export const telehealthActiveSessions = gauge({
  name: 'telehealth_active_sessions',
  help: 'Telehealth sessions currently in the active state',
});

export const telehealthRecordingConsentTotal = counter({
  name: 'telehealth_recording_consent_total',
  help: 'Recording consent decisions',
  labelNames: ['outcome'],
});

// ── Helpers ────────────────────────────────────────────────────────────────
export function recordNotificationDelivery(channel: string, status: string): void {
  notificationDeliveriesTotal.inc({ channel, status });
}

export function recordNotificationAttempt(channel: string): void {
  notificationDeliveryAttemptsTotal.inc({ channel });
}

export function setNotificationRetryQueueDepth(depth: number): void {
  notificationRetryQueueDepth.set(depth);
}

export function recordTelehealthSessionEvent(
  event: 'created' | 'started' | 'ended' | 'cancelled' | 'archived'
): void {
  telehealthSessionsTotal.inc({ event });
  if (event === 'started') telehealthActiveSessions.inc();
  if (event === 'ended') telehealthActiveSessions.dec();
}

export function recordTelehealthRecordingConsent(granted: boolean): void {
  telehealthRecordingConsentTotal.inc({ outcome: granted ? 'granted' : 'denied' });
}
