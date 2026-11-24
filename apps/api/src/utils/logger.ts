import pino from 'pino';

// pino-pretty is a dev-only transport that isn't installed in test environments —
// skip it in tests so any module importing the logger works under Jest.
const usePrettyTransport = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

// Exported so tests can build a logger with the exact production redaction rules
// (see integration/phi-log-leak.flow.test.ts).
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  // Standardized JSON log format with mandatory fields:
  // timestamp, level, service, requestId, message.
  // `timestamp` is emitted as an ISO-8601 string for reliable Logstash parsing.
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: process.env.SERVICE_NAME ?? 'api',
    requestId: undefined,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  messageKey: 'message',
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

/**
 * Fields that may be attached to a request-scoped child logger.
 */
export interface RequestLogContext {
  requestId?: string;
  clinicId?: string;
  userId?: string;
}

/**
 * Build a request-scoped child logger that carries the mandatory `requestId`
 * field plus the optional `clinicId` and `userId` fields on every entry.
 */
export function createRequestLogger(context: RequestLogContext = {}): pino.Logger {
  const bindings: Record<string, string> = {};
  if (context.requestId !== undefined) bindings.requestId = context.requestId;
  if (context.clinicId !== undefined) bindings.clinicId = context.clinicId;
  if (context.userId !== undefined) bindings.userId = context.userId;
  return logger.child(bindings);
}

export default logger;