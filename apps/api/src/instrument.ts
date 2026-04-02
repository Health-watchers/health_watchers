import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations: [nodeProfilingIntegration()],

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  profilesSampleRate: 1.0,

  // Alert thresholds are configured in the Sentry dashboard:
  // - Error rate alert: > 1% over 5 min window
  // - p95 latency alert: > 2000ms

  beforeSend(event) {
    return scrubPHI(event);
  },

  beforeSendTransaction(event) {
    return scrubPHI(event);
  },
});

/**
 * Scrub PHI fields from Sentry events before they leave the process.
 * Patient names, IDs, DOBs and contact info must never reach Sentry.
 */
const PHI_KEYS = [
  'firstName', 'lastName', 'fullName', 'name',
  'dateOfBirth', 'dob', 'phone', 'email', 'address',
  'patientId', 'mrn', 'ssn', 'insuranceId',
];

function scrubPHI<T extends Sentry.Event>(event: T): T {
  if (event.request?.data) {
    event.request.data = redactKeys(event.request.data);
  }
  if (event.extra) {
    event.extra = redactKeys(event.extra) as Record<string, unknown>;
  }
  return event;
}

function redactKeys(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = PHI_KEYS.includes(key) ? '[Redacted]' : redactKeys(value);
  }
  return result;
}
