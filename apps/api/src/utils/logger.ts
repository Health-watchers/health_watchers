import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'body.password',
      'body.token',
      'body.refreshToken',
      'body.tempToken',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
