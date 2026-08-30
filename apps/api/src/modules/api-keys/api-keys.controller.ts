import crypto from 'crypto';
import { Request, Response } from 'express';
import { ApiKeyModel, ALL_SCOPES, ApiKeyScope } from './models/api-key.model';
import { ApiKeyUsageModel } from './models/api-key-usage.model';
import { AuditService } from '../audit/audit.service';
import logger from '@api/utils/logger';

const sha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');

const generateRawKey = () => {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return { rawKey: `hw_${randomBytes}`, prefix: `hw_${randomBytes.slice(0, 8)}` };
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
 *               expiresAt: { type: string, format: date-time, nullable: true }
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
 *                     scopes: { type: array, items: { type: string } }
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
    const keys = await ApiKeyModel.find({ clinicId }).lean();
    return res.json({ status: 'success', data: keys });
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
