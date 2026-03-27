import * as Sentry from '@sentry/node';

/**
 * Registers a Sentry Cron Monitor for the /health endpoint.
 *
 * This creates an uptime check in Sentry that expects a heartbeat
 * every 60 seconds. If the heartbeat is missed, Sentry fires an alert.
 *
 * Alert rules configured in Sentry dashboard (or via sentry-alert-rules.yml):
 *  - Error rate > 1%  over a 5-minute window  → notify on-call
 *  - p95 latency > 2s over a 5-minute window  → notify on-call
 *  - Missed heartbeat → notify within 5 minutes
 */
export const HEALTH_MONITOR_SLUG = 'health-watchers-api-uptime';

export function startUptimeMonitor(intervalSeconds = 60): () => void {
  const checkIn = () => {
    const checkInId = Sentry.captureCheckIn(
      {
        monitorSlug: HEALTH_MONITOR_SLUG,
        status: 'in_progress',
      },
      {
        schedule: { type: 'interval', value: intervalSeconds, unit: 'second' },
        checkinMargin: 5,       // minutes before Sentry marks as missed
        maxRuntime: 1,          // minutes before Sentry marks as timed out
        failureIssueThreshold: 1,
        recoveryThreshold: 1,
      },
    );

    // Perform the actual health check
    const start = Date.now();
    fetch(`http://localhost:${process.env.API_PORT || 4000}/health`)
      .then((res) => {
        const ok = res.ok;
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: HEALTH_MONITOR_SLUG,
          status: ok ? 'ok' : 'error',
          duration: (Date.now() - start) / 1000,
        });
      })
      .catch((err) => {
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: HEALTH_MONITOR_SLUG,
          status: 'error',
          duration: (Date.now() - start) / 1000,
        });
        Sentry.captureException(err);
      });
  };

  // Run immediately, then on interval
  checkIn();
  const timer = setInterval(checkIn, intervalSeconds * 1000);

  // Return cleanup function
  return () => clearInterval(timer);
}
