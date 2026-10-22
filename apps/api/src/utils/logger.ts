import pino from 'pino';

// pino-pretty is a dev-only transport that isn't installed in test environments —
// skip it in tests so any module importing the logger works under Jest.
const usePrettyTransport = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

// Exported so tests can build a logger with the exact production redaction rules
// (see integration/phi-log-leak.flow.test.ts).
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.currentPassword',
      'body.newPassword',
      'body.token',
      'body.refreshToken',
      'body.tempToken',
      'body.secretKey',
      'body.privateKey',
      'body.cardNumber',
      'body.cvv',
    ],
    censor: '[REDACTED]',
  },
};

const logger = pino({
  ...loggerOptions,
  ...(usePrettyTransport
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

export default logger;
