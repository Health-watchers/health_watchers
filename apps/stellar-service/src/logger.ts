import pino from 'pino';
import { getRequestId } from './request-context.js';

const base = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

function attachReqId(obj?: Record<string, unknown>) {
  const rid = getRequestId();
  if (!rid) return obj ?? {};
  return { ...(obj ?? {}), requestId: rid };
}

const logger = {
  debug: (obj: any, msg?: string) => base.debug(attachReqId(obj), msg),
  info: (obj: any, msg?: string) => base.info(attachReqId(obj), msg),
  warn: (obj: any, msg?: string) => base.warn(attachReqId(obj), msg),
  error: (obj: any, msg?: string) => base.error(attachReqId(obj), msg),
  child: (obj: Record<string, unknown>) => base.child(attachReqId(obj)),
  flush: () => base.flush && (base.flush() as void),
} as unknown as pino.Logger;

export default logger;
