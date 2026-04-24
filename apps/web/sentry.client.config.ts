import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [Sentry.replayIntegration()],

  beforeSend(event) {
    // Strip any PHI that may have leaked into breadcrumbs or request bodies
    if (event.request?.data) {
      event.request.data = '[Redacted]';
    }
    return event;
  },
});
