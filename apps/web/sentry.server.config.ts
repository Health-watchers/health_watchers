import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  beforeSend(event) {
    if (event.request?.data) {
      event.request.data = '[Redacted]';
    }
    return event;
  },
});
