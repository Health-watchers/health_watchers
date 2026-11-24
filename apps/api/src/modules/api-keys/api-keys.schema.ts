import { z } from 'zod';
import { ALL_SCOPES, MAX_ROTATION_GRACE_HOURS } from './models/api-key.model';

const scopeEnum = z.enum(ALL_SCOPES as [string, ...string[]]);

export const createApiKeyBody = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    scopes: z.array(scopeEnum).max(ALL_SCOPES.length).optional(),
    environment: z.enum(['live', 'test']).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    rateLimitPerMin: z.number().int().min(0).max(100_000).optional(),
    expiresAt: z.string().min(4).max(40).optional(),
    expiresInDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

export const updateApiKeyBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    scopes: z.array(scopeEnum).max(ALL_SCOPES.length).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    rateLimitPerMin: z.number().int().min(0).max(100_000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const rotateApiKeyBody = z
  .object({
    gracePeriodHours: z.number().min(0).max(MAX_ROTATION_GRACE_HOURS).optional(),
  })
  .strict();

export const revokeApiKeyBody = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();
