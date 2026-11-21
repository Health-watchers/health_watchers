import * as Sentry from '@sentry/node';
import { appConfig } from '../config/config.service';

export const HEALTH_MONITOR_SLUG = 'health-watchers-api-uptime';

/**
 * Resolve the port the API is listening on.
 *
 * Uses the validated `API_PORT` from config. `PORT` is honoured only as a
 * documented override for PaaS hosts that inject it.
 */
function resolvePort(): number {
  const override = process.env.PORT;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return appConfig.api.port;
}

export function startUptimeMonitor(intervalSeconds = 60): () => void {
  const checkIn = () => {
    const start = Date.now();
    fetch(`http://localhost:${resolvePort()}/health`)
      .then((res) => {
        if (!res.ok) {
          Sentry.captureMessage(`Health check failed: ${res.status}`);
        }
      })
      .catch((err: Error) => {
        Sentry.captureException(err);
      });
    void start; // suppress unused warning
  };

  checkIn();
  const timer = setInterval(checkIn, intervalSeconds * 1000);
  return () => clearInterval(timer);
}