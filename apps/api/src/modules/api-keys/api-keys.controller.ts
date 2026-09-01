import crypto from 'crypto';
import { Request, Response } from 'express';
import {
  ApiKeyModel,
  ALL_SCOPES,
  ApiKeyScope,
  ApiKeyEnvironment,
  DEFAULT_ROTATION_GRACE_HOURS,
  MAX_ROTATION_GRACE_HOURS,
} from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';
import { AuditService } from '../audit/audit.service';
import logger from '@api/utils/logger';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

const generateRawKey = (environment: ApiKeyEnvironment = 'live') => {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const body = environment === 'test' ? `test_${randomBytes}` : randomBytes;
  return { rawKey: `hw_${body}`, prefix: `hw_${body.slice(0, 8)}` };
};

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Log the real error server-side and respond with a generic message in production —
 * returning err.message directly leaked internal paths/schema details (see PENTEST_FINDINGS FIND-006).
 */
function sendServerError(res: Response, err: unknown, action: string) {
  logger.error({ err }, `API key ${action} failed`);
  return res.status(500).json({
    error: 'ServerError',
    message: isDev && err instanceof Error ? err.message : 'An unexpected error occurred',
  });
}

function coerceExpiry(body: Record<string, unknown>): Date | undefined {
  if (body.expiresAt) return new Date(body.expiresAt as string);
  if (body.expiresInDays) {
    const days = Number(body.expiresInDays);
    if (Number.isFinite(days) && days > 0) {
      return new Date(Date.now() + days * 86400_000);
    }
  }
  return undefined;
}

/**
 * @swagger
 * /api-keys:
 *   post:
 *     summary: Create a new API key for service-to-service authentication
 *     description: The raw key is returned once in the response and is never retrievable again — only its hash and prefix are stored.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: 'Integration Service' }
 *               scopes:
 *                 type: array
 *                 items: { type: string, enum: [patients:read, patients:write, encounters:read, encounters:write, payments:read, payments:write, lab-results:write] }
 *               environment: { type: string, enum: [live, test], default: live }
 *               tags: { type: array, items: { type: string }, description: 'Up to 20 free-form tags' }
 *               description: { type: string }
 *               rateLimitPerMin: { type: integer, minimum: 0, maximum: 100000, default: 0, description: '0 = no per-key override' }
 *               expiresAt: { type: string, format: date-time, nullable: true }
 *               expiresInDays: { type: integer, description: 'Alternative to expiresAt — ignored if expiresAt is set' }
 *     responses:
 *       201:
 *         description: API key created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     key: { type: string, description: 'Raw key — shown once, store securely', example: 'hw_Kx9mN2pQ7rT4vW1yZ3aB6cD8eF0gH5iJ' }
 *                     prefix: { type: string, example: 'hw_Kx9mN2pQ' }
 *                     environment: { type: string, enum: [live, test] }
 *                     scopes: { type: array, items: { type: string } }
 *                     tags: { type: array, items: { type: string } }
 *                     rateLimitPerMin: { type: integer }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error (e.g. missing name)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /api/v1/api-keys
export const createApiKey = async (req: Request, res: Response) => {
  try {
    const { name, scopes, environment, tags, description, rateLimitPerMin } = req.body;
    const clinicId = req.user!.clinicId;
    const createdBy = req.user!.userId;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'BadRequest', message: 'name is required' });
    }

    const env: ApiKeyEnvironment = environment === 'test' ? 'test' : 'live';

    const validScopes: ApiKeyScope[] = Array.isArray(scopes)
      ? scopes.filter((s: string) => (ALL_SCOPES as string[]).includes(s))
      : [];

    const { rawKey, prefix } = generateRawKey(env);
    const keyHash = sha256(rawKey);

    const apiKey = await ApiKeyModel.create({
      clinicId,
      name,
      keyHash,
      prefix,
      scopes: validScopes,
      isActive: true,
      environment: env,
      tags: Array.isArray(tags) ? tags.slice(0, 20).map(String) : [],
      description: typeof description === 'string' ? description : undefined,
      rateLimitPerMin:
        Number.isFinite(Number(rateLimitPerMin)) && Number(rateLimitPerMin) >= 0
          ? Math.min(Number(rateLimitPerMin), 100_000)
          : 0,
      createdBy,
      expiresAt: coerceExpiry(req.body),
    });

    await AuditService.log(
      {
        action: 'API_KEY_CREATE',
        resourceType: 'ApiKey',
        resourceId: String(apiKey._id),
        userId: createdBy,
        clinicId,
        outcome: 'SUCCESS',
        metadata: { name, scopes: validScopes, environment: env },
      },
      req
    );

    return res.status(201).json({
      status: 'success',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        key: rawKey, // returned ONCE, never stored in plaintext
        prefix,
        environment: apiKey.environment,
        scopes: apiKey.scopes,
        tags: apiKey.tags,
        rateLimitPerMin: apiKey.rateLimitPerMin,
        expiresAt: apiKey.expiresAt,
        createdAt: (apiKey as any).createdAt,
      },
    });
  } catch (err: any) {
    return sendServerError(res, err, 'create');
  }
};

/**
 * @swagger
 * /api-keys:
 *   get:
 *     summary: List API keys for the caller's clinic
 *     description: Returns metadata only — the raw key and hash are never included.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string, example: 'Integration Service' }
 *                       prefix: { type: string, example: 'hw_Kx9mN2pQ' }
 *                       scopes: { type: array, items: { type: string } }
 *                       isActive: { type: boolean }
 *                       lastUsedAt: { type: string, format: date-time, nullable: true }
 *                       expiresAt: { type: string, format: date-time, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/v1/api-keys
export const listApiKeys = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const filter: Record<string, unknown> = { clinicId };
    if (req.query.environment) filter.environment = req.query.environment;
    if (req.query.tag) filter.tags = req.query.tag;
    if (req.query.active === 'true') filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;

    const keys = await ApiKeyModel.find(filter).sort({ createdAt: -1 }).lean();
    const now = Date.now();
    return res.json({
      status: 'success',
      data: keys.map((k) => ({
        ...k,
        status: k.revokedAt
          ? 'revoked'
          : k.expiresAt && new Date(k.expiresAt).getTime() < now
            ? 'expired'
            : k.isActive
              ? 'active'
              : 'inactive',
        inRotationGrace: !!(
          k.previousKeyExpiresAt && new Date(k.previousKeyExpiresAt).getTime() > now
        ),
      })),
    });
  } catch (err: any) {
    return sendServerError(res, err, 'list');
  }
};

/**
 * @swagger
 * /api-keys/{id}:
 *   patch:
 *     summary: Update an API key's name, scopes, or active state
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: 'Integration Service (renamed)' }
 *               scopes:
 *                 type: array
 *                 items: { type: string, enum: [patients:read, patients:write, encounters:read, encounters:write, payments:read, payments:write, lab-results:write] }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     prefix: { type: string }
 *                     scopes: { type: array, items: { type: string } }
 *                     isActive: { type: boolean }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// PATCH /api/v1/api-keys/:id
export const updateApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;
    const { name, scopes, isActive, tags, description, rateLimitPerMin } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (scopes !== undefined) updates.scopes = scopes;
    if (isActive !== undefined) updates.isActive = isActive;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags.slice(0, 20).map(String) : [];
    if (description !== undefined) updates.description = description;
    if (rateLimitPerMin !== undefined) {
      const n = Number(rateLimitPerMin);
      if (!Number.isFinite(n) || n < 0) {
        return res
          .status(400)
          .json({ error: 'BadRequest', message: 'rateLimitPerMin must be a non-negative number' });
      }
      updates.rateLimitPerMin = Math.min(n, 100_000);
    }

    const apiKey = await ApiKeyModel.findOneAndUpdate(
      { _id: req.params.id, clinicId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!apiKey) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });

    await AuditService.log(
      {
        action: 'API_KEY_UPDATE',
        resourceType: 'ApiKey',
        resourceId: String(apiKey._id),
        userId,
        clinicId,
        outcome: 'SUCCESS',
        metadata: updates,
      },
      req
    );

    return res.json({ status: 'success', data: apiKey });
  } catch (err: any) {
    return sendServerError(res, err, 'update');
  }
};

/**
 * @swagger
 * /api-keys/{id}/rotate:
 *   post:
 *     summary: Rotate an API key, invalidating the old raw key
 *     description: Generates a new raw key and hash for the existing key record. The old raw key stops working immediately; the new raw key is returned once.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: API key rotated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'API key rotated. Store the new key — it will not be shown again.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     key: { type: string, description: 'New raw key — shown once', example: 'hw_Ny3wR8sV1uX4tZ6bC9eG2iK5mP0qA7dF' }
 *                     prefix: { type: string, example: 'hw_Ny3wR8sV' }
 *                     scopes: { type: array, items: { type: string } }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     isActive: { type: boolean }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /api/v1/api-keys/:id/rotate
// Body: { gracePeriodHours?: number }  (0 = revoke old secret immediately)
export const rotateApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;

    const existing = await ApiKeyModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }
    if (existing.revokedAt) {
      return res.status(409).json({ error: 'Conflict', message: 'Cannot rotate a revoked key' });
    }

    const requested = Number(req.body?.gracePeriodHours);
    const graceHours = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), MAX_ROTATION_GRACE_HOURS)
      : DEFAULT_ROTATION_GRACE_HOURS;

    const env: ApiKeyEnvironment = existing.environment === 'test' ? 'test' : 'live';
    const { rawKey, prefix } = generateRawKey(env);
    const keyHash = sha256(rawKey);
    const now = new Date();

    const previousKeyExpiresAt =
      graceHours > 0 ? new Date(now.getTime() + graceHours * 3600_000) : null;

    // Aggregation-pipeline update so the *current* keyHash can be copied into
    // previousKeyHash atomically before it is overwritten.
    const pipelineUpdate = [
      {
        $set: {
          keyHash,
          prefix,
          isActive: true,
          lastRotatedAt: now,
          rotationCount: { $add: [{ $ifNull: ['$rotationCount', 0] }, 1] },
          previousKeyHash: previousKeyExpiresAt ? '$keyHash' : '$$REMOVE',
          previousKeyExpiresAt: previousKeyExpiresAt ?? '$$REMOVE',
        },
      },
      { $unset: ['lastUsedAt'] },
    ];

    const rotated = await ApiKeyModel.findByIdAndUpdate(existing._id, pipelineUpdate as any, {
      new: true,
    }).lean();

    await AuditService.log(
      {
        action: 'API_KEY_ROTATE',
        resourceType: 'ApiKey',
        resourceId: String(existing._id),
        userId,
        clinicId,
        outcome: 'SUCCESS',
        metadata: {
          name: existing.name,
          oldPrefix: existing.prefix,
          newPrefix: prefix,
          gracePeriodHours: graceHours,
        },
      },
      req
    );

    return res.json({
      status: 'success',
      message:
        graceHours > 0
          ? `API key rotated. The previous key stops working in ${graceHours}h. Store the new key — it will not be shown again.`
          : 'API key rotated. The previous key is now invalid. Store the new key — it will not be shown again.',
      data: {
        id: rotated!._id,
        name: rotated!.name,
        key: rawKey, // new raw key, returned once
        prefix,
        scopes: rotated!.scopes,
        expiresAt: rotated!.expiresAt,
        isActive: rotated!.isActive,
        rotationCount: (rotated as any)!.rotationCount,
        previousKeyExpiresAt,
      },
    });
  } catch (err: any) {
    return sendServerError(res, err, 'rotate');
  }
};

/**
 * @swagger
 * /api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Sets the key inactive. Requests authenticated with the revoked key are rejected immediately; the key record and its usage history are retained.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: API key revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     isActive: { type: boolean, example: false }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// DELETE /api/v1/api-keys/:id
// Body: { reason?: string }
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined;

    const key = await ApiKeyModel.findOneAndUpdate(
      { _id: req.params.id, clinicId },
      {
        $set: { isActive: false, revokedAt: new Date(), revokedReason: reason, revokedBy: userId },
        $unset: { previousKeyHash: '', previousKeyExpiresAt: '' },
      },
      { new: true }
    ).lean();

    if (!key) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });

    await AuditService.log(
      {
        action: 'API_KEY_REVOKE',
        resourceType: 'ApiKey',
        resourceId: String(key._id),
        userId,
        clinicId,
        outcome: 'SUCCESS',
        metadata: { name: key.name, reason },
      },
      req
    );

    return res.json({
      status: 'success',
      data: { id: key._id, isActive: key.isActive, revokedAt: key.revokedAt },
    });
  } catch (err: any) {
    return sendServerError(res, err, 'revoke');
  }
};

/**
 * @swagger
 * /api-keys/{id}/usage:
 *   get:
 *     summary: Get daily usage stats for an API key
 *     description: Returns up to the last 30 daily usage records, newest first.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Daily usage records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       apiKeyId: { type: string }
 *                       clinicId: { type: string }
 *                       date: { type: string, example: '2026-08-30', description: 'YYYY-MM-DD' }
 *                       requestCount: { type: integer, example: 142 }
 *                       lastEndpoint: { type: string, example: '/api/v1/patients' }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/v1/api-keys/:id/usage
export const getApiKeyUsage = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const key = await ApiKeyModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!key) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });

    const usage = await ApiKeyUsageModel.find({ apiKeyId: String(req.params.id) })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    return res.json({ status: 'success', data: usage });
  } catch (err: any) {
    return sendServerError(res, err, 'usage lookup');
  }
};

/**
 * @swagger
 * /api-keys/{id}/analytics:
 *   get:
 *     summary: Get rolled-up usage analytics for an API key
 *     description: Aggregates daily usage into totals, an error rate, and a per-day series over a configurable window.
 *     tags: [ApiKeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: days
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 365, default: 30 }
 *     responses:
 *       200:
 *         description: Usage analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     windowDays: { type: integer, example: 30 }
 *                     totals:
 *                       type: object
 *                       properties:
 *                         requests: { type: integer }
 *                         rejected: { type: integer }
 *                         errors: { type: integer }
 *                     errorRate: { type: number, example: 0.0123 }
 *                     series:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date: { type: string, example: '2026-08-30' }
 *                           requests: { type: integer }
 *                           rejected: { type: integer }
 *                           errors: { type: integer }
 *                           lastEndpoint: { type: string }
 *                     lastUsedAt: { type: string, format: date-time, nullable: true }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/v1/api-keys/:id/analytics?days=30
// Rolled-up usage: total / rejected / error counts and a per-day series.
export const getApiKeyAnalytics = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const key = await ApiKeyModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!key) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    const rows = await ApiKeyUsageModel.find({
      apiKeyId: String(req.params.id),
      date: { $gte: since },
    })
      .sort({ date: 1 })
      .lean();

    const totals = rows.reduce(
      (acc, r: any) => {
        acc.requests += r.requestCount || 0;
        acc.rejected += r.rejectedCount || 0;
        acc.errors += r.errorCount || 0;
        return acc;
      },
      { requests: 0, rejected: 0, errors: 0 }
    );

    return res.json({
      status: 'success',
      data: {
        windowDays: days,
        totals,
        errorRate: totals.requests ? Number((totals.errors / totals.requests).toFixed(4)) : 0,
        series: rows.map((r: any) => ({
          date: r.date,
          requests: r.requestCount || 0,
          rejected: r.rejectedCount || 0,
          errors: r.errorCount || 0,
          lastEndpoint: r.lastEndpoint || '',
        })),
        lastUsedAt: key.lastUsedAt ?? null,
      },
    });
  } catch (err: any) {
    return sendServerError(res, err, 'analytics');
  }
};
