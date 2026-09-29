import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyImmunizationCertificate } from './immunization-verify.controller';

const router = Router();

/**
 * Public rate limiter: 10 requests / minute per IP.
 * No Redis store dependency — in-memory is sufficient for a public lookup
 * endpoint that does not need cross-instance coordination at the same level
 * as auth routes.
 */
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: {
    error: 'TooManyRequests',
    message: 'Too many verification requests. Please try again in a minute.',
  },
});

/**
 * GET /:token
 *
 * Publicly accessible — no authentication middleware applied.
 * Mounted at /api/v1/verify/immunization, so the full path is:
 *   GET /api/v1/verify/immunization/:token
 */
router.get('/:token', verifyLimiter, verifyImmunizationCertificate);

export default router;
