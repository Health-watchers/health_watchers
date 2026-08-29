# Middleware Guide

## Overview

This guide documents the common middleware utilities available in the Health Watchers API. These utilities help reduce code duplication and enforce consistent patterns across the application.

**Related Issues**: #929, #1053

## Table of Contents

- [Authentication & Authorization](#authentication--authorization)
- [Validation Utilities](#validation-utilities)
- [Multi-Tenancy & Scoping](#multi-tenancy--scoping)
- [Pagination](#pagination)
- [Middleware Composition](#middleware-composition)
- [Best Practices](#best-practices)

## Authentication & Authorization

### `requireAuthentication`

Ensures the request has an authenticated user. Use this for endpoints that require authentication but don't need specific roles.

```typescript
import { requireAuthentication } from '@api/middlewares';

router.get('/profile', requireAuthentication, getProfile);
```

### `requireAnyRole(roles: string[])`

Requires the user to have at least one of the specified roles. More flexible than exact role matching.

```typescript
import { requireAnyRole } from '@api/middlewares';

// Allow both doctors and nurses to prescribe
router.post(
  '/prescriptions',
  requireAnyRole(['DOCTOR', 'NURSE']),
  createPrescription
);
```

### `requireRoles(...roles: AppRole[])`

From `auth.middleware.ts` - requires exact role match.

```typescript
import { requireRoles } from '@api/middlewares';

router.delete('/users/:id', requireRoles('SUPER_ADMIN'), deleteUser);
```

## Validation Utilities

### `validateObjectId(...paramNames: string[])`

Validates route parameters as MongoDB ObjectIds. Defaults to `'id'` if no parameter names provided.

```typescript
import { validateObjectId } from '@api/middlewares';

// Validate single parameter
router.get('/patients/:id', validateObjectId('id'), getPatient);

// Validate multiple parameters
router.put(
  '/clinics/:clinicId/patients/:patientId',
  validateObjectId('clinicId', 'patientId'),
  updatePatient
);
```

### `isValidObjectId(id: string): boolean`

Helper function for service-layer ObjectId validation.

```typescript
import { isValidObjectId } from '@api/middlewares';

if (!isValidObjectId(patientId)) {
  throw new AppError('Invalid patient ID format', 400);
}
```

### `validateBody<T>(schema: ZodSchema<T>)`

Lightweight body validation using Zod schemas.

```typescript
import { validateBody } from '@api/middlewares';
import { z } from 'zod';

const createPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().datetime(),
});

router.post('/patients', validateBody(createPatientSchema), createPatient);
```

### `validateQuery<T>(schema: ZodSchema<T>)`

Query parameter validation using Zod schemas.

```typescript
import { validateQuery } from '@api/middlewares';
import { z } from 'zod';

const searchQuerySchema = z.object({
  q: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional(),
});

router.get('/patients/search', validateQuery(searchQuerySchema), searchPatients);
```

## Multi-Tenancy & Scoping

### `requireClinicMatch(options?: ClinicMatchOptions)`

Enforces clinic-level scoping for multi-tenant routes. Sets `res.locals.filter` with the appropriate clinicId filter.

**Options:**
- `paramName?: string` - Route parameter to validate against caller's clinicId
- `allowSuperAdmin?: boolean` - Allow SUPER_ADMIN to bypass filter (default: true)

```typescript
import { requireClinicMatch } from '@api/middlewares';

// Auto-scope to authenticated user's clinic
router.get('/patients', requireClinicMatch(), async (req, res) => {
  // res.locals.filter = { clinicId: ObjectId(...) }
  const patients = await Patient.find({ ...res.locals.filter, status: 'active' });
  res.json(patients);
});

// Validate explicit clinicId parameter
router.get(
  '/clinics/:clinicId/patients',
  requireClinicMatch({ paramName: 'clinicId' }),
  getClinicPatients
);
```

### `requireResourceOwner(source, fieldName, userField, allowSuperAdmin?)`

Generic ownership guard that compares request values against user properties.

**Parameters:**
- `source`: `'params' | 'body' | 'query'` - Where to find the value
- `fieldName`: string - Field name in the request
- `userField`: `'userId' | 'clinicId' | 'patientId'` - User field to compare against
- `allowSuperAdmin`: boolean - Whether to allow SUPER_ADMIN bypass (default: true)

```typescript
import { requireResourceOwner } from '@api/middlewares';

// Ensure patient can only access their own records
router.get(
  '/portal/patients/:patientId/records',
  requireResourceOwner('params', 'patientId', 'patientId'),
  getPatientRecords
);
```

## Pagination

### `parsePaginationQuery(allowedSortFields?, defaultSortField?)`

Parses and validates pagination and sorting query parameters. Sets `res.locals.pagination`.

**Parameters:**
- `allowedSortFields`: string[] - Whitelist of sortable fields (default: `['createdAt', 'updatedAt']`)
- `defaultSortField`: string - Default sort field (default: `'createdAt'`)

**Query Parameters:**
- `page`: number (min: 1, default: 1)
- `limit`: number (min: 1, max: 100, default: 20)
- `sortBy`: string (must be in allowedSortFields)
- `sortDir`: `'asc' | 'desc'` (default: 'desc')

```typescript
import { parsePaginationQuery } from '@api/middlewares';

router.get(
  '/patients',
  parsePaginationQuery(['createdAt', 'lastName', 'firstName'], 'lastName'),
  async (req, res) => {
    const { page, limit, sort } = res.locals.pagination;
    const skip = (page - 1) * limit;
    
    const patients = await Patient.find()
      .sort({ [sort.field]: sort.direction === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({ patients, page, limit });
  }
);
```

## Middleware Composition

### `composeMiddleware(...middlewares)`

Composes multiple middleware functions into a single middleware. Executes in order and stops if any middleware doesn't call `next()`.

```typescript
import { composeMiddleware, authenticate, requireAnyRole, validateBody } from '@api/middlewares';

const authAndValidate = composeMiddleware(
  authenticate,
  requireAnyRole(['DOCTOR', 'NURSE']),
  validateBody(prescriptionSchema)
);

router.post('/prescriptions', authAndValidate, createPrescription);
```

### `conditionalMiddleware(predicate, middleware)`

Conditionally applies middleware based on a predicate function.

```typescript
import { conditionalMiddleware, rateLimitMiddleware } from '@api/middlewares';

// Only apply rate limiting in production
router.post(
  '/api/expensive-operation',
  conditionalMiddleware(
    () => process.env.NODE_ENV === 'production',
    rateLimitMiddleware
  ),
  expensiveOperation
);
```

### `ensureRequestId`

Ensures `req.requestId` exists, generating one if not present. Useful as a fallback.

```typescript
import { ensureRequestId } from '@api/middlewares';

router.get('/health', ensureRequestId, healthCheck);
```

## Best Practices

### 1. Use Composition for Complex Routes

Instead of chaining many middleware:

```typescript
// ❌ Not recommended
router.post(
  '/prescriptions',
  authenticate,
  requireRoles('DOCTOR'),
  validateBody(schema),
  requireClinicMatch(),
  handler
);

// ✅ Better
const authMiddleware = composeMiddleware(
  authenticate,
  requireRoles('DOCTOR'),
  requireClinicMatch()
);

router.post(
  '/prescriptions',
  authMiddleware,
  validateBody(schema),
  handler
);
```

### 2. Leverage res.locals for Data Passing

Use `res.locals` to pass data between middleware:

```typescript
router.get(
  '/patients',
  requireClinicMatch(), // Sets res.locals.filter
  parsePaginationQuery(), // Sets res.locals.pagination
  async (req, res) => {
    const { filter } = res.locals;
    const { page, limit, sort } = res.locals.pagination;
    
    // Use both filter and pagination
    const patients = await Patient.find(filter)
      .sort({ [sort.field]: sort.direction === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    res.json(patients);
  }
);
```

### 3. Validate Early

Place validation middleware before expensive operations:

```typescript
// ✅ Validate first
router.post(
  '/patients',
  validateObjectId('clinicId'),
  validateBody(patientSchema),
  authenticate,
  requireClinicMatch(),
  createPatient
);
```

### 4. Use Type-Safe Schemas

Always define Zod schemas for validation:

```typescript
import { z } from 'zod';

const updatePatientSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
});

router.patch(
  '/patients/:id',
  validateObjectId('id'),
  validateBody(updatePatientSchema),
  updatePatient
);
```

### 5. Handle Errors Consistently

Let the error middleware handle exceptions. Use AppError for structured errors:

```typescript
import { AppError } from '@api/utils/app-error';

async function getPatient(req: Request, res: Response) {
  const patient = await Patient.findById(req.params.id);
  
  if (!patient) {
    throw new AppError('Patient not found', 404, 'NotFound', 'low');
  }
  
  res.json(patient);
}
```

## Migration Guide

When refactoring existing routes to use these utilities:

1. **Identify repeated patterns** in your route handlers
2. **Replace custom validation** with `validateObjectId`, `validateBody`, `validateQuery`
3. **Extract clinic scoping** using `requireClinicMatch`
4. **Use composition** to simplify complex middleware chains
5. **Test thoroughly** to ensure behavior is unchanged

### Example Migration

**Before:**
```typescript
router.get('/patients/:id', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  
  if (req.user.clinicId !== patient.clinicId && !req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // ... handler code
});
```

**After:**
```typescript
router.get(
  '/patients/:id',
  requireAuthentication,
  validateObjectId('id'),
  requireClinicMatch(),
  getPatient
);
```

## Related Files

- `apps/api/src/middlewares/common.middleware.ts` - Implementation
- `apps/api/src/middlewares/index.ts` - Exports
- `apps/api/src/middlewares/auth.middleware.ts` - Authentication
- `apps/api/src/middlewares/validate.middleware.ts` - Validation

## Support

For questions or issues with middleware utilities, please:
1. Check this guide first
2. Review the implementation in `common.middleware.ts`
3. Create an issue with the `middleware` label
