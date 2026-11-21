import pino from 'pino';
import { getRequestId, getClinicId, getUserId } from './request-context.js';

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'stellar-service';

const base = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

function attachContext(obj?: Record<string, unknown>) {
  const rid = getRequestId();
  const clinicId = getClinicId();
  const userId = getUserId();
  const ctx: Record<string, unknown> = { ...(obj ?? {}) };
  if (rid) ctx.requestId = rid;
  if (clinicId) ctx.clinicId = clinicId;
  if (userId) ctx.userId = userId;
  return ctx;
}

const logger = {
  debug: (obj: any, msg?: string) => base.debug(attachContext(obj), msg),
  info: (obj: any, msg?: string) => base.info(attachContext(obj), msg),
  warn: (obj: any, msg?: string) => base.warn(attachContext(obj), msg),
  error: (obj: any, msg?: string) => base.error(attachContext(obj), msg),
  child: (obj: Record<string, unknown>) => base.child(attachContext(obj)),
  flush: () => base.flush && (base.flush() as void),
} as unknown as pino.Logger;

export default logger;