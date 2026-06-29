import crypto from 'crypto';
import { Request, Response } from 'express';
import { ApiKeyModel, ALL_SCOPES, ApiKeyScope } from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';
import { AuditService } from '../audit/audit.service';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

const generateRawKey = () => {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return { rawKey: `hw_${randomBytes}`, prefix: `hw_${randomBytes.slice(0, 8)}` };
};

// POST /api/v1/api-keys
export const createApiKey = async (req: Request, res: Response) => {
  try {
    const { name, scopes, expiresAt } = req.body;
    const clinicId = req.user!.clinicId;
    const createdBy = req.user!.userId;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'BadRequest', message: 'name is required' });
    }

    const validScopes: ApiKeyScope[] = Array.isArray(scopes)
      ? scopes.filter((s: string) => (ALL_SCOPES as string[]).includes(s))
      : [];

    const { rawKey, prefix } = generateRawKey();
    const keyHash = sha256(rawKey);

    const apiKey = await ApiKeyModel.create({
      clinicId,
      name,
      keyHash,
      prefix,
      scopes: validScopes,
      isActive: true,
      createdBy,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    await AuditService.log(
      {
        action: 'API_KEY_CREATE',
        resourceType: 'ApiKey',
        resourceId: String(apiKey._id),
        userId: createdBy,
        clinicId,
        outcome: 'SUCCESS',
        metadata: { name, scopes: validScopes },
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
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: (apiKey as any).createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: err.message });
  }
};

// GET /api/v1/api-keys
export const listApiKeys = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const keys = await ApiKeyModel.find({ clinicId }).lean();
    return res.json({ status: 'success', data: keys });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: err.message });
  }
};

// PATCH /api/v1/api-keys/:id
export const updateApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;
    const { name, scopes, isActive } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (scopes !== undefined) updates.scopes = scopes;
    if (isActive !== undefined) updates.isActive = isActive;

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
    return res.status(500).json({ error: 'ServerError', message: err.message });
  }
};

// POST /api/v1/api-keys/:id/rotate
export const rotateApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;

    const existing = await ApiKeyModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    }

    const { rawKey, prefix } = generateRawKey();
    const keyHash = sha256(rawKey);

    const rotated = await ApiKeyModel.findByIdAndUpdate(
      existing._id,
      { $set: { keyHash, prefix, lastUsedAt: undefined, isActive: true } },
      { new: true }
    ).lean();

    await AuditService.log(
      {
        action: 'API_KEY_ROTATE',
        resourceType: 'ApiKey',
        resourceId: String(existing._id),
        userId,
        clinicId,
        outcome: 'SUCCESS',
        metadata: { name: existing.name, oldPrefix: existing.prefix, newPrefix: prefix },
      },
      req
    );

    return res.json({
      status: 'success',
      message: 'API key rotated. Store the new key — it will not be shown again.',
      data: {
        id: rotated!._id,
        name: rotated!.name,
        key: rawKey, // new raw key, returned once
        prefix,
        scopes: rotated!.scopes,
        expiresAt: rotated!.expiresAt,
        isActive: rotated!.isActive,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: err.message });
  }
};

// DELETE /api/v1/api-keys/:id
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const userId = req.user!.userId;

    const key = await ApiKeyModel.findOneAndUpdate(
      { _id: req.params.id, clinicId },
      { $set: { isActive: false } },
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
        metadata: { name: key.name },
      },
      req
    );

    return res.json({ status: 'success', data: { id: key._id, isActive: key.isActive } });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: err.message });
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
    return res.status(500).json({ error: 'ServerError', message: err.message });
  }
};
