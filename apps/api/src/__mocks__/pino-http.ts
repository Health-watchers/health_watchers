/**
 * Manual mock for pino-http.
 * Returns a no-op Express middleware so tests that import @api/app
 * don't need a real pino logger with .child() support.
 */
import type { RequestHandler } from 'express';

const pinoHttp = (): RequestHandler => (_req, _res, next) => next();
export default pinoHttp;
