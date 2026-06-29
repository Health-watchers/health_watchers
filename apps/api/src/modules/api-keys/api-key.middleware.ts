import { Request, Response, NextFunction } from 'express';
import { ApiKeyModel, hashApiKey } from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';
import { scopeGrantsAccess } from './constants/scopes';

declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        userId: string;
        clinicId: string;
        scopes: string[];
      };
    }
  }
}

const extractApiKey = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.substring(7);
  return key.startsWith('hw_') ? key : null;
};

const logUsage = async (
  apiKeyId: string,
  clinicId: string,
  endpoint: string,
  req: Request
): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await ApiKeyUsageModel.findOneAndUpdate(
      { apiKeyId, date: today },
      {
        $inc: { requestCount: 1 },
        $set: { lastEndpoint: endpoint, clinicId },
      },
      { upsert: true }
    );
  } catch {
    // Non-fatal — never block the request
  }
};

/**
 * Middleware to authenticate an API key from Authorization: Bearer hw_xxx
 * Fixes: queries by keyHash (not key)
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const rawKey = extractApiKey(req.headers.authorization);
  if (!rawKey) return next();

  try {
    const keyHash = hashApiKey(rawKey);
    // Fixed: query by keyHash, not 'key'
    const apiKey = await ApiKeyModel.findOne({ keyHash, isActive: true }).lean();

    if (!apiKey) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return res.status(401).json({ error: 'Unauthorized', message: 'API key has expired' });
    }

    req.apiKey = {
      id: String(apiKey._id),
      userId: String(apiKey.createdBy),
      clinicId: String(apiKey.clinicId),
      scopes: apiKey.scopes,
    };

    // Fire-and-forget side effects
    ApiKeyModel.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch(() => {});
    logUsage(String(apiKey._id), String(apiKey.clinicId), req.path, req);

    return next();
  } catch {
    return res.status(500).json({ error: 'InternalServerError', message: 'Authentication failed' });
  }
};

/**
 * Middleware to validate API key scopes against the requested endpoint.
 * Must be used after authenticateApiKey.
 */
export const validateApiKeyScopes = (req: Request, res: Response, next: NextFunction) => {
  if (!req.apiKey) return next();

  const { scopes } = req.apiKey;
  const hasAccess = scopes.some((scope: any) =>
    scopeGrantsAccess(scope, req.path, req.method)
  );

  if (!hasAccess) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'API key does not have permission to access this endpoint',
    });
  }

  return next();
};
