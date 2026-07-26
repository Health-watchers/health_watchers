import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
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
});

export default logger;
