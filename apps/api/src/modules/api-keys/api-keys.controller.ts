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
