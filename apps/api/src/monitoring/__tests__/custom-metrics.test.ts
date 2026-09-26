import { register } from '@api/services/metrics.service';
import {
  recordNotificationAttempt,
  recordNotificationDelivery,
  setNotificationRetryQueueDepth,
  recordTelehealthSessionEvent,
  recordTelehealthRecordingConsent,
  telehealthActiveSessions,
} from '../custom-metrics';

describe('custom application metrics (#1257)', () => {
  it('registers notification series on the scrape registry', async () => {
    recordNotificationAttempt('email');
    recordNotificationDelivery('email', 'sent');
    recordNotificationDelivery('sms', 'failed');
    setNotificationRetryQueueDepth(7);

    const text = await register.metrics();
    expect(text).toContain('notification_delivery_attempts_total{channel="email"} 1');
    expect(text).toContain('notification_deliveries_total{channel="email",status="sent"} 1');
    expect(text).toContain('notification_deliveries_total{channel="sms",status="failed"} 1');
    expect(text).toContain('notification_retry_queue_depth 7');
  });

  it('tracks the active telehealth session gauge across lifecycle events', async () => {
    await telehealthActiveSessions.set(0);
    recordTelehealthSessionEvent('created');
    recordTelehealthSessionEvent('started');
    recordTelehealthSessionEvent('started');
    expect(await telehealthActiveSessions.get().then((g) => g.values[0].value)).toBe(2);

    recordTelehealthSessionEvent('ended');
    expect(await telehealthActiveSessions.get().then((g) => g.values[0].value)).toBe(1);
  });

  it('labels recording consent decisions by outcome', async () => {
    recordTelehealthRecordingConsent(true);
    recordTelehealthRecordingConsent(false);
    const text = await register.metrics();
    expect(text).toMatch(/telehealth_recording_consent_total\{outcome="granted"\} \d+/);
    expect(text).toMatch(/telehealth_recording_consent_total\{outcome="denied"\} \d+/);
  });
});
