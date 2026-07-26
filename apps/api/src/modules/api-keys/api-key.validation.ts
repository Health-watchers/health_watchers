import { z } from 'zod';
import { PREDEFINED_SCOPES } from './constants/scopes';

const scopeValues = Object.values(PREDEFINED_SCOPES);

export const createApiKeySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be less than 100 characters'),
    scopes: z
      .array(z.enum(scopeValues as [string, ...string[]]))
      .min(1, 'At least one scope is required')
      .max(20, 'Maximum 20 scopes allowed'),
    expiresAt: z.string().datetime().optional().nullable(),
  }),
});

export const updateApiKeySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be less than 100 characters')
      .optional(),
    scopes: z
      .array(z.enum(scopeValues as [string, ...string[]]))
      .min(1, 'At least one scope is required')
      .max(20, 'Maximum 20 scopes allowed')
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

export const listApiKeysSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>['body'];
export type UpdateApiKeyDto = z.infer<typeof updateApiKeySchema>['body'];
export type ListApiKeysQuery = z.infer<typeof listApiKeysSchema>['query'];
