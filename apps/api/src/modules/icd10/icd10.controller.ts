import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ICD10Model } from './icd10.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { cacheResponse } from '@api/middlewares/cache.middleware';
import {
  listFavorites,
  addFavorite,
  removeFavorite,
  getFavoriteCodes,
  listRecent,
  recordRecentUsage,
} from './icd10-favorites.service';

export const icd10Routes = Router();
icd10Routes.use(authenticate);

const ICD10_TTL = 24 * 60 * 60; // 24 hours — static data, never invalidated

interface ICD10SearchResult {
  code: string;
  description: string;
  category?: string;
  chapter?: string;
}

/**
 * @swagger
 * /icd10/search:
 *   get:
 *     summary: Search ICD-10 codes (clinic favorites surfaced first)
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Matching codes, with the clinic's favorites listed first
 */
// GET /api/v1/icd10/search?q=<query>&limit=10
icd10Routes.get(
  '/search',
  // Cache key is clinic-scoped because favorites ordering differs per clinic.
  cacheResponse(
    ICD10_TTL,
    (req) =>
      `clinic:${req.user?.clinicId ?? 'none'}:icd10:${req.query.q ?? ''}:${req.query.limit ?? 10}`
  ),
  async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));

      if (!q) {
        return res.status(400).json({ error: 'BadRequest', message: 'q is required' });
      }

      // Code prefix match (e.g. "J06" → J06.x) OR full-text description search
      const isCodeLike = /^[A-Za-z]\d/.test(q);

      let results: ICD10SearchResult[];
      if (isCodeLike) {
        results = await ICD10Model.find({
          code: { $regex: `^${q.toUpperCase()}`, $options: 'i' },
          isValid: true,
        })
          .select('code description category chapter')
          .limit(limit)
          .lean();
      } else {
        results = await ICD10Model.find(
          { $text: { $search: q }, isValid: true },
          { score: { $meta: 'textScore' } }
        )
          .select('code description category chapter')
          .sort({ score: { $meta: 'textScore' } })
          .limit(limit)
          .lean();
      }

      // Surface this clinic's favorites first, preserving relative order otherwise.
      const favorites = new Set(await getFavoriteCodes(req.user!.clinicId));
      const decorated = results.map((r) => ({ ...r, isFavorite: favorites.has(r.code) }));
      decorated.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

      return res.json({ status: 'success', data: decorated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── Favorites ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /icd10/favorites:
 *   get:
 *     summary: List the clinic's favorite ICD-10 codes
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The clinic's favorite codes }
 */
icd10Routes.get('/favorites', async (req: Request, res: Response) => {
  try {
    const favorites = await listFavorites(req.user!.clinicId);
    return res.json({ status: 'success', data: favorites });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

const addFavoriteSchema = z.object({
  code: z.string().min(2).max(10),
  description: z.string().max(500).optional(),
});

/**
 * @swagger
 * /icd10/favorites:
 *   post:
 *     summary: Add an ICD-10 code to the clinic's favorites
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: J06.9 }
 *               description: { type: string }
 *     responses:
 *       201: { description: Favorite added; returns the updated list }
 *       404: { description: ICD-10 code not found }
 */
icd10Routes.post(
  '/favorites',
  validateRequest({ body: addFavoriteSchema }),
  async (req: Request, res: Response) => {
    try {
      const code = String(req.body.code).toUpperCase();

      // Validate the code exists before favoriting it.
      const existing = await ICD10Model.findOne({ code, isValid: true })
        .select('code description')
        .lean<{ code: string; description: string }>();
      if (!existing) {
        return res
          .status(404)
          .json({ error: 'NotFound', message: `ICD-10 code '${code}' not found` });
      }

      const description = req.body.description || existing.description;
      const favorites = await addFavorite(
        req.user!.clinicId,
        code,
        description,
        req.user!.userId
      );
      return res.status(201).json({ status: 'success', data: favorites });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

/**
 * @swagger
 * /icd10/favorites/{code}:
 *   delete:
 *     summary: Remove an ICD-10 code from the clinic's favorites
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Favorite removed; returns the updated list }
 */
icd10Routes.delete('/favorites/:code', async (req: Request, res: Response) => {
  try {
    const favorites = await removeFavorite(req.user!.clinicId, req.params.code);
    return res.json({ status: 'success', data: favorites });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── Recently used ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /icd10/recent:
 *   get:
 *     summary: List the clinic's recently-used ICD-10 codes
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { description: Recently-used codes, most recent first }
 */
icd10Routes.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 10);
    const recent = await listRecent(req.user!.clinicId, limit);
    return res.json({ status: 'success', data: recent });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

const recordRecentSchema = z.object({
  code: z.string().min(2).max(10),
  description: z.string().max(500).optional(),
});

/**
 * @swagger
 * /icd10/recent:
 *   post:
 *     summary: Record that the clinic used an ICD-10 code
 *     description: Called when a code is selected/attached so it appears in the recent list.
 *     tags: [ICD-10]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *     responses:
 *       204: { description: Usage recorded }
 */
icd10Routes.post(
  '/recent',
  validateRequest({ body: recordRecentSchema }),
  async (req: Request, res: Response) => {
    await recordRecentUsage(req.user!.clinicId, req.body.code, req.body.description ?? '');
    return res.status(204).send();
  }
);

// GET /api/v1/icd10/:code — validate a single code
icd10Routes.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code.toUpperCase();
    const doc = await ICD10Model.findOne({ code, isValid: true }).select('code description').lean();
    if (!doc)
      return res
        .status(404)
        .json({ error: 'NotFound', message: `ICD-10 code '${code}' not found` });
    return res.json({ status: 'success', data: doc });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
