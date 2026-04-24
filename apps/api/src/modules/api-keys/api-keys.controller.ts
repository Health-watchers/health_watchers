import crypto from 'crypto';
import { Request, Response } from 'express';
import { ApiKeyModel, ALL_SCOPES, ApiKeyScope } from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

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

    // Generate: hw_{8-char prefix}{24 random bytes hex}
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const prefix = randomBytes.slice(0, 8);
    const fullKey = `hw_${randomBytes}`;
    const keyHash = sha256(fullKey);

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

    return res.status(201).json({
      status: 'success',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        key: fullKey, // returned ONCE, never stored in plaintext
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

// DELETE /api/v1/api-keys/:id  (revoke / deactivate)
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    const key = await ApiKeyModel.findOneAndUpdate(
      { _id: req.params.id, clinicId },
      { isActive: false },
      { new: true }
    );
    if (!key) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
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
