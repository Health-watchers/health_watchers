import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyModel, ApiKeyScope } from '../modules/api-keys/models/api-key.model';
import { ApiKeyUsageModel } from '../modules/api-keys/models/api-key-usage.model';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

export interface ApiKeyContext {
  id: string;
  scopes: ApiKeyScope[];
  clinicId: string;
  environment: 'live' | 'test';
  rateLimitPerMin: number;
  /** True when the request authenticated with a superseded (grace-window) secret. */
  viaPreviousKey: boolean;
}

/** Record one API-key request against the daily rollup (fire-and-forget). */
export function trackApiKeyUsage(
  apiKeyId: string,
  clinicId: string,
  endpoint: string,
  kind: 'request' | 'rejected' | 'error' = 'request'
): void {
  const today = new Date().toISOString().slice(0, 10);
  const inc: Record<string, number> = {};
  if (kind === 'request') inc.requestCount = 1;
  if (kind === 'rejected') {
    inc.requestCount = 1;
    inc.rejectedCount = 1;
  }
  if (kind === 'error') inc.errorCount = 1;

  Promise.resolve(
    ApiKeyUsageModel.findOneAndUpdate(
      { apiKeyId, date: today },
      { $inc: inc, $set: { lastEndpoint: endpoint, clinicId } },
      { upsert: true }
    ).exec()
  ).catch(() => undefined);
}

export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('ApiKey ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith('hw_')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key format' });
  }

  const keyHash = sha256(rawKey);

  // Match either the current secret or a still-valid superseded secret
  // (rotation grace window, #1252).
  const apiKey = await ApiKeyModel.findOne({
    $or: [{ keyHash }, { previousKeyHash: keyHash }],
  })
    .select('+keyHash +previousKeyHash')
    .lean();

  if (!apiKey) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Invalid or deactivated API key' });
  }

  if (apiKey.revokedAt) {
    return res.status(401).json({ error: 'Unauthorized', message: 'API key has been revoked' });
  }

  if (!apiKey.isActive) {
    return res.status(401).json({ error: 'Unauthorized', message: 'API key is deactivated' });
  }

  if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'API key has expired' });
  }

  const storedHash = (apiKey as any).keyHash as string | undefined;
  const viaPreviousKey = storedHash != null && storedHash !== keyHash;
  if (viaPreviousKey) {
    const graceOk =
      apiKey.previousKeyExpiresAt && new Date() < new Date(apiKey.previousKeyExpiresAt);
    if (!graceOk) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key was rotated and the grace period has ended',
      });
    }
    res.setHeader('X-Api-Key-Rotated', 'true');
  }

  // Attach clinic context (same shape as JWT user)
  req.user = {
    userId: String(apiKey.createdBy),
    role: 'READ_ONLY',
    clinicId: String(apiKey.clinicId),
  };
  const context: ApiKeyContext = {
    id: String(apiKey._id),
    scopes: apiKey.scopes,
    clinicId: String(apiKey.clinicId),
    environment: apiKey.environment ?? 'live',
    rateLimitPerMin: apiKey.rateLimitPerMin ?? 0,
    viaPreviousKey,
  };
  (req as any).apiKey = context;

  // Update lastUsedAt + usage tracking (fire-and-forget)
  ApiKeyModel.findByIdAndUpdate(apiKey._id, { lastUsedAt: new Date() }).exec();
  trackApiKeyUsage(context.id, context.clinicId, req.path, 'request');

  return next();
};

export const requireScope =
  (scope: ApiKeyScope) => (req: Request, res: Response, next: NextFunction) => {
    const apiKey = (req as any).apiKey as ApiKeyContext | undefined;
    if (!apiKey) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Scope check requires API key auth' });
    }
    if (!apiKey.scopes.includes(scope)) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: `Missing required scope: ${scope}` });
    }
    return next();
  };
