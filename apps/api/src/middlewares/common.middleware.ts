/**
 * common.middleware.ts
 *
 * Issue #929, #1053 — Extract Common Middleware
 *
 * Centralises middleware patterns that were previously duplicated across route
 * controllers.  Import from here instead of re-implementing in each module.
 *
 * Patterns extracted:
 *  - validateObjectId   — validate :id / custom param as a MongoDB ObjectId
 *  - requireClinicMatch — assert that a resource's clinicId matches the caller
 *  - parsePaginationQuery — unified pagination + sort query parser
 *  - requireResourceOwner — generic ownership guard (userId or clinicId match)
 *  - requireAuthentication — ensure user is authenticated
 *  - requireAnyRole — require at least one of the specified roles
 *  - conditionalMiddleware — apply middleware based on a condition
 *  - composeMiddleware — compose multiple middleware into one
 */

import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z, ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MongoDB ObjectId pattern — 24 hex characters. */
export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/**
 * Returns true when the string is a valid MongoDB ObjectId.
 * Use this in service-layer code; use {@link validateObjectId} middleware at the
 * route layer.
 */
export function isValidObjectId(id: string): boolean {
  return OBJECT_ID_REGEX.test(id);
}

// ---------------------------------------------------------------------------
// validateObjectId — middleware factory
// ---------------------------------------------------------------------------

/**
 * Middleware that validates one or more route params as MongoDB ObjectIds.
 *
 * Usage:
 *   router.get('/:id', validateObjectId('id'), handler);
 *   router.put('/:clinicId/:patientId', validateObjectId('clinicId', 'patientId'), handler);
 */
export function validateObjectId(...paramNames: string[]) {
  const params = paramNames.length > 0 ? paramNames : ['id'];

  return (req: Request, res: Response, next: NextFunction): void => {
    for (const param of params) {
      const value = req.params[param];
      if (!value || !OBJECT_ID_REGEX.test(value)) {
        res.status(400).json({
          error: 'BadRequest',
          message: `Invalid or missing route parameter: ${param} (must be a 24-character hex ObjectId)`,
        });
        return;
      }
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// parsePaginationQuery — middleware
// ---------------------------------------------------------------------------

export interface ParsedPagination {
  page: number;
  limit: number;
  sort: { field: string; direction: 'asc' | 'desc' };
}

declare module 'express-serve-static-core' {
  interface Locals {
    pagination: ParsedPagination;
  }
}

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Middleware that parses and validates pagination + sort query params.
 *
 * Sets `res.locals.pagination` for downstream handlers.
 *
 * @param allowedSortFields — Whitelist of field names that can be sorted on.
 *   Defaults to `['createdAt', 'updatedAt']`.
 *
 * Usage:
 *   router.get('/', parsePaginationQuery(['createdAt', 'name']), handler);
 *   // In handler: const { page, limit, sort } = res.locals.pagination;
 */
export function parsePaginationQuery(
  allowedSortFields: string[] = ['createdAt', 'updatedAt'],
  defaultSortField = 'createdAt'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = paginationQuerySchema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid pagination parameters',
        details: result.error.errors,
      });
      return;
    }

    const { page, limit, sortBy, sortDir } = result.data;
    const field = sortBy ?? defaultSortField;

    if (!allowedSortFields.includes(field)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `Invalid sort field "${field}". Allowed: ${allowedSortFields.join(', ')}`,
      });
      return;
    }

    res.locals.pagination = {
      page,
      limit,
      sort: { field, direction: sortDir as 'asc' | 'desc' },
    };

    next();
  };
}

// ---------------------------------------------------------------------------
// requireClinicMatch — middleware factory
// ---------------------------------------------------------------------------

/**
 * Middleware factory that enforces clinicId scoping for multi-tenant routes.
 *
 * Adds a `clinicId` filter to `res.locals.filter` so the downstream handler
 * can safely merge it into any database query without repeating the check.
 *
 * Also optionally validates a `:clinicId` route param when present.
 *
 * Usage (auto-scope from JWT):
 *   router.get('/patients', requireClinicMatch(), handler);
 *   // In handler: const filter = { ...res.locals.filter, status: 'active' };
 *
 * Usage (validate explicit :clinicId param):
 *   router.get('/clinics/:clinicId/patients', requireClinicMatch({ paramName: 'clinicId' }), handler);
 */
export interface ClinicMatchOptions {
  /**
   * Route param name to validate against the caller's clinicId.
   * When provided, the middleware returns 403 if the param does not match.
   */
  paramName?: string;
  /**
   * Allow SUPER_ADMIN to bypass the clinic filter (defaults to true).
   */
  allowSuperAdmin?: boolean;
}

export function requireClinicMatch(options: ClinicMatchOptions = {}) {
  const { paramName, allowSuperAdmin = true } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const { clinicId, isSuperAdmin } = req.user;

    // SUPER_ADMIN bypass — they can access any clinic's data
    if (isSuperAdmin && allowSuperAdmin) {
      // If a clinicId param is present, use it; otherwise leave filter open
      const paramClinicId = paramName ? req.params[paramName] : undefined;
      res.locals.filter = paramClinicId
        ? { clinicId: new Types.ObjectId(paramClinicId) }
        : {};
      next();
      return;
    }

    // Validate explicit route param (e.g. /clinics/:clinicId/...)
    if (paramName) {
      const paramValue = req.params[paramName];
      if (!paramValue || paramValue !== clinicId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Access to this clinic is not allowed',
        });
        return;
      }
    }

    if (!clinicId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'No clinic associated with this account',
      });
      return;
    }

    // Set the scoped clinic filter for downstream handlers
    res.locals.filter = { clinicId: new Types.ObjectId(clinicId) };
    next();
  };
}

// ---------------------------------------------------------------------------
// requireResourceOwner — generic ownership guard
// ---------------------------------------------------------------------------

/**
 * Builds a middleware that asserts the authenticated user owns a resource by
 * comparing a field on the request (param, body, or query) against the user's
 * id or clinicId.
 *
 * This is a lightweight pre-check — it does NOT fetch the resource from the DB.
 * For ownership checks that require a DB lookup, do it inside the handler.
 *
 * Usage:
 *   // Ensure :patientId matches the logged-in patient's own id
 *   router.get('/portal/patients/:patientId', requireResourceOwner('params', 'patientId', 'patientId'));
 */
export type RequestSource = 'params' | 'body' | 'query';
export type UserField = 'userId' | 'clinicId' | 'patientId';

export function requireResourceOwner(
  source: RequestSource,
  fieldName: string,
  userField: UserField,
  allowSuperAdmin = true
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (allowSuperAdmin && req.user.isSuperAdmin) {
      next();
      return;
    }

    const requestValue = (req[source] as Record<string, unknown>)[fieldName];
    const userValue = req.user[userField];

    if (!requestValue || !userValue || String(requestValue) !== String(userValue)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// validateBody — lightweight body-schema validation middleware
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around Zod for inline schema validation without the full
 * `validateRequest` overhead.  Replaces the common pattern of manually calling
 * `schema.safeParse(req.body)` inside handlers.
 *
 * Usage:
 *   router.post('/', validateBody(myZodSchema), handler);
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid request body',
        details: result.error.errors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Thin wrapper for query-string schema validation.
 *
 * Usage:
 *   router.get('/', validateQuery(myQuerySchema), handler);
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid query parameters',
        details: result.error.errors,
      });
      return;
    }
    Object.assign(req.query, result.data as Record<string, string>);
    next();
  };
}

// ---------------------------------------------------------------------------
// requireAuthentication — simplified auth check
// ---------------------------------------------------------------------------

/**
 * Middleware that ensures the request has an authenticated user.
 * Use this when you just need to verify authentication without role checks.
 *
 * Usage:
 *   router.get('/profile', requireAuthentication, handler);
 */
export function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// requireAnyRole — flexible role checking
// ---------------------------------------------------------------------------

/**
 * Middleware that requires the user to have at least one of the specified roles.
 * More flexible than requireRoles which checks for exact role match.
 *
 * Usage:
 *   router.post('/prescribe', requireAnyRole(['DOCTOR', 'NURSE']), handler);
 */
export function requireAnyRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// conditionalMiddleware — apply middleware based on condition
// ---------------------------------------------------------------------------

/**
 * Conditionally applies middleware based on a predicate function.
 * Useful for applying middleware only in certain environments or conditions.
 *
 * Usage:
 *   router.get('/data',
 *     conditionalMiddleware(
 *       () => process.env.NODE_ENV === 'production',
 *       rateLimitMiddleware
 *     ),
 *     handler
 *   );
 */
export function conditionalMiddleware(
  predicate: (req: Request) => boolean,
  middleware: (req: Request, res: Response, next: NextFunction) => void
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (predicate(req)) {
      middleware(req, res, next);
    } else {
      next();
    }
  };
}

// ---------------------------------------------------------------------------
// composeMiddleware — compose multiple middleware into one
// ---------------------------------------------------------------------------

/**
 * Composes multiple middleware functions into a single middleware.
 * Middleware are executed in order, and any middleware that doesn't call next()
 * will stop the chain.
 *
 * Usage:
 *   const authAndValidate = composeMiddleware(
 *     authenticate,
 *     requireRoles('DOCTOR'),
 *     validateBody(schema)
 *   );
 *   router.post('/prescriptions', authAndValidate, handler);
 */
export function composeMiddleware(
  ...middlewares: Array<(req: Request, res: Response, next: NextFunction) => void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let index = 0;

    const runNext = (): void => {
      if (index >= middlewares.length) {
        next();
        return;
      }

      const middleware = middlewares[index++];
      try {
        middleware(req, res, runNext);
      } catch (error) {
        next(error);
      }
    };

    runNext();
  };
}

// ---------------------------------------------------------------------------
// ensureRequestId — guarantee requestId exists
// ---------------------------------------------------------------------------

/**
 * Ensures that req.requestId exists, generating one if not present.
 * Useful as a fallback for routes that may not have correlation middleware.
 *
 * Usage:
 *   router.get('/health', ensureRequestId, handler);
 */
export function ensureRequestId(req: Request, res: Response, next: NextFunction): void {
  if (!req.requestId) {
    req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
}
