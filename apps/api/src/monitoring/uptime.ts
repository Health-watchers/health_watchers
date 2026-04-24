import * as Sentry from '@sentry/node';

export const HEALTH_MONITOR_SLUG = 'health-watchers-api-uptime';

export function startUptimeMonitor(intervalSeconds = 60): () => void {
  const checkIn = () => {
    const start = Date.now();
    fetch(`http://localhost:${process.env.API_PORT || 4000}/health`)
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
