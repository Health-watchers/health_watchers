import { Request, Response } from 'express';
import { ApiKeyModel, generateApiKey, getKeyPrefix, hashApiKey } from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';
import { CreateApiKeyDto, UpdateApiKeyDto, ListApiKeysQuery } from './api-key.validation';
import { AuthenticatedUser } from '@api/types/express';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Create a new API key with specified scopes
 */
export const createApiKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, scopes, expiresAt } = req.body as CreateApiKeyDto;
    const { userId, clinicId } = req.user;

    const rawKey = generateApiKey();
    const hashedKey = hashApiKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);

    const apiKey = await ApiKeyModel.create({
      name,
      key: hashedKey,
      keyPrefix,
      userId,
      clinicId,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        keyPrefix: apiKey.prefix,
        key: rawKey, // Only returned once at creation
        scopes: apiKey.scopes,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (err) {
    console.error('Create API key error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to create API key' });
  }
};

/**
 * List API keys for the authenticated user
 */
export const listApiKeys = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit, isActive } = req.query as unknown as ListApiKeysQuery;
    const { userId, clinicId } = req.user;

    const filter: any = { userId, clinicId };
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const skip = (page - 1) * limit;
    const [keys, total] = await Promise.all([
      ApiKeyModel.find(filter, { key: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ApiKeyModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: keys,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('List API keys error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to list API keys' });
  }
};

/**
 * Get a specific API key by ID
 */
export const getApiKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, clinicId } = req.user;

    const apiKey = await ApiKeyModel.findOne({ _id: id, userId, clinicId }, { key: 0 }).lean();

    if (!apiKey) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }

    return res.json({ status: 'success', data: apiKey });
  } catch (err) {
    console.error('Get API key error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to retrieve API key' });
  }
};

/**
 * Update an API key (name, scopes, active status)
 */
export const updateApiKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, clinicId } = req.user;
    const updates = req.body as UpdateApiKeyDto;

    const apiKey = await ApiKeyModel.findOneAndUpdate(
      { _id: id, userId, clinicId },
      { $set: updates },
      { new: true, runValidators: true, select: '-key' }
    ).lean();

    if (!apiKey) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }

    return res.json({ status: 'success', data: apiKey });
  } catch (err) {
    console.error('Update API key error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to update API key' });
  }
};

/**
 * Revoke (deactivate) an API key
 */
export const revokeApiKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, clinicId } = req.user;

    const apiKey = await ApiKeyModel.findOneAndUpdate(
      { _id: id, userId, clinicId },
      { $set: { isActive: false } },
      { new: true, select: '-key' }
    ).lean();

    if (!apiKey) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }

    return res.json({ status: 'success', message: 'API key revoked', data: apiKey });
  } catch (err) {
    console.error('Revoke API key error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to revoke API key' });
  }
};

/**
 * Get usage logs for an API key
 */
export const getApiKeyUsage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { userId, clinicId } = req.user;

    // Verify API key belongs to user
    const apiKey = await ApiKeyModel.findOne({ _id: id, userId, clinicId }).lean();
    if (!apiKey) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      ApiKeyUsageModel.find({ apiKeyId: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ApiKeyUsageModel.countDocuments({ apiKeyId: id }),
    ]);

    return res.json({
      status: 'success',
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('Get API key usage error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to retrieve usage logs' });
  }
};

/**
 * Get all available scopes
 */
export const getAvailableScopes = async (_req: Request, res: Response) => {
  try {
    const { getAllScopes } = await import('./constants/scopes');
    const scopes = getAllScopes();

    return res.json({
      status: 'success',
      data: {
        scopes,
        description: 'Available API key scopes for fine-grained access control',
      },
    });
  } catch (err) {
    console.error('Get available scopes error:', err);
    return res
      .status(500)
      .json({ error: 'InternalServerError', message: 'Failed to retrieve scopes' });
  }
};
