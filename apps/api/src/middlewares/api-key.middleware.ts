import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyModel, ApiKeyScope } from '../modules/api-keys/models/api-key.model';
import { ApiKeyUsageModel } from '../modules/api-keys/models/api-key-usage.model';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

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
  const apiKey = await ApiKeyModel.findOne({ keyHash, isActive: true }).select('+keyHash').lean();

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or deactivated API key' });
  }

  if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'API key has expired' });
  }

  // Attach clinic context (same shape as JWT user)
  req.user = { userId: String(apiKey.createdBy), role: 'READ_ONLY', clinicId: String(apiKey.clinicId) };
  (req as any).apiKey = { id: String(apiKey._id), scopes: apiKey.scopes };

  // Update lastUsedAt + usage tracking (fire-and-forget)
  const today = new Date().toISOString().slice(0, 10);
  ApiKeyModel.findByIdAndUpdate(apiKey._id, { lastUsedAt: new Date() }).exec();
  ApiKeyUsageModel.findOneAndUpdate(
    { apiKeyId: String(apiKey._id), date: today },
    { $inc: { requestCount: 1 }, $set: { lastEndpoint: req.path, clinicId: String(apiKey.clinicId) } },
    { upsert: true }
  ).exec();

  return next();
};

export const requireScope = (scope: ApiKeyScope) => (req: Request, res: Response, next: NextFunction) => {
  const apiKey = (req as any).apiKey as { scopes: ApiKeyScope[] } | undefined;
  if (!apiKey) {
    return res.status(403).json({ error: 'Forbidden', message: 'Scope check requires API key auth' });
  }
  if (!apiKey.scopes.includes(scope)) {
    return res.status(403).json({ error: 'Forbidden', message: `Missing required scope: ${scope}` });
  }
  return next();
};
