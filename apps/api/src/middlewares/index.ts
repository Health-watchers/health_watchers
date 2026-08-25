/**
 * Middleware barrel — single entry point for all shared API middlewares.
 *
 * Issue #929, #1053: common patterns extracted into common.middleware.ts.
 *
 * Import examples:
 *   import { authenticate, requireRoles } from '@api/middlewares';
 *   import { validateObjectId, requireClinicMatch } from '@api/middlewares';
 *   import { composeMiddleware, conditionalMiddleware } from '@api/middlewares';
 */

// Auth & RBAC
export { authenticate, requireRoles } from './auth.middleware';

// Request validation
export { validateRequest } from './validate.middleware';

// Common shared middleware (issue #929, #1053)
export {
  // ObjectId helpers
  OBJECT_ID_REGEX,
  isValidObjectId,
  validateObjectId,
  // Pagination
  parsePaginationQuery,
  type ParsedPagination,
  // Clinic scoping
  requireClinicMatch,
  type ClinicMatchOptions,
  // Ownership guard
  requireResourceOwner,
  type RequestSource,
  type UserField,
  // Inline validation shortcuts
  validateBody,
  validateQuery,
  // Auth utilities
  requireAuthentication,
  requireAnyRole,
  // Middleware composition utilities
  conditionalMiddleware,
  composeMiddleware,
  // Request ID utilities
  ensureRequestId,
} from './common.middleware';

// Rate limiting
export {
  authLimiter,
  forgotPasswordLimiter,
  aiLimiter,
  paymentLimiter,
  generalLimiter,
  bulkExportLimiter,
  patientSearchLimiter,
  reportGenerationLimiter,
} from './rate-limit.middleware';

// Error handling
export { errorHandler, errorMiddleware } from './error.middleware';

// Async handler wrapper
export { asyncHandler } from './async.handler';

// Other
export { cacheResponse } from './cache.middleware';
export { correlationMiddleware } from './correlation.middleware';
export { traceIdHeader } from './trace-id.middleware';
export { metricsMiddleware } from './metrics.middleware';
export { paginationMiddleware } from '../middleware/pagination.middleware';
