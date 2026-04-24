/**
 * Manual mock for the rate-limit middleware.
 * Replaces all rate limiters with a pass-through middleware so tests
 * that import @api/app don't need redis or rate-limit-redis installed.
 */
import type { RequestHandler } from 'express';

const passThrough: RequestHandler = (_req, _res, next) => next();

export const authLimiter = passThrough;
export const forgotPasswordLimiter = passThrough;
export const aiLimiter = passThrough;
export const paymentLimiter = passThrough;
export const generalLimiter = passThrough;
