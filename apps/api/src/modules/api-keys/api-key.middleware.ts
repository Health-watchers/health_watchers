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

/**
 * Extract API key from Authorization header
 * Supports: Authorization: Bearer hw_xxxxx
 */
const extractApiKey = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.substring(7);
  return key.startsWith('hw_') ? key : null;
};

/**
 * Log API key usage for audit trail
 */
const logApiKeyUsage = async (
  apiKeyId: string,
  userId: string,
  clinicId: string,
  method: string,
  endpoint: string,
  statusCode: number,
  scopes: string[],
  scopeGranted: boolean,
  req: Request,
  errorMessage?: string
) => {
  try {
    await ApiKeyUsageModel.create({
      apiKeyId,
      userId,
      clinicId,
      method,
      endpoint,
      statusCode,
      scopes,
      scopeGranted,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      errorMessage,
    });
  } catch (err) {
    console.error('Failed to log API key usage:', err);
  }
};

/**
 * Middleware to authenticate and validate API key scopes
 * Must be used before route handlers
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const rawKey = extractApiKey(authHeader);

  if (!rawKey) {
    return next(); // Not an API key request, let other auth middleware handle it
  }

  try {
    const hashedKey = hashApiKey(rawKey);
    const apiKey = await ApiKeyModel.findOne(
      { key: hashedKey, isActive: true },
      { key: 0 } // Exclude the hashed key from response
    ).lean();

    if (!apiKey) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    // Check if key has expired
    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      await logApiKeyUsage(
        String(apiKey._id),
        String(apiKey.userId),
        String(apiKey.clinicId),
        req.method,
        req.path,
        401,
        apiKey.scopes,
        false,
        req,
        'API key expired'
      );
      return res.status(401).json({ error: 'Unauthorized', message: 'API key has expired' });
    }

    // Attach API key info to request
    req.apiKey = {
      id: String(apiKey._id),
      userId: String(apiKey.userId),
      clinicId: String(apiKey.clinicId),
      scopes: apiKey.scopes,
    };

    // Update last used timestamp
    ApiKeyModel.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch((err) =>
      console.error('Failed to update lastUsedAt:', err)
    );

    next();
  } catch (err: unknown) {
    console.error('API key authentication error:', err);
    return res.status(500).json({ error: 'InternalServerError', message: 'Authentication failed' });
  }
};

/**
 * Middleware to validate API key scopes against the requested endpoint
 * Must be used after authenticateApiKey
 */
export const validateApiKeyScopes = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.apiKey) {
    return next(); // Not an API key request
  }

  const { scopes, id: apiKeyId, userId, clinicId } = req.apiKey;
  const endpoint = req.path;
  const method = req.method;

  // Check if any scope grants access to this endpoint
  const hasAccess = scopes.some((scope: any) => scopeGrantsAccess(scope, endpoint, method));

  if (!hasAccess) {
    await logApiKeyUsage(
      apiKeyId,
      userId,
      clinicId,
      method,
      endpoint,
      403,
      scopes,
      false,
      req,
      'Insufficient scopes'
    );
    return res.status(403).json({
      error: 'Forbidden',
      message: 'API key does not have permission to access this endpoint',
      requiredScopes: scopes,
    });
  }

  // Log successful scope validation
  await logApiKeyUsage(apiKeyId, userId, clinicId, method, endpoint, 200, scopes, true, req);

  next();
};
