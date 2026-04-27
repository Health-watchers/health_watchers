import { Router, Request, Response } from 'express';
import { ICD10Model } from './icd10.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { cacheResponse } from '@api/middlewares/cache.middleware';

export const icd10Routes = Router();
icd10Routes.use(authenticate);

const ICD10_TTL = 24 * 60 * 60; // 24 hours — static data, never invalidated

// GET /api/v1/icd10/search?q=<query>&limit=10
icd10Routes.get(
  '/search',
  cacheResponse(ICD10_TTL, (req) => `global:icd10:${req.query.q ?? ''}:${req.query.limit ?? 10}`),
  async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));

      if (!q) {
        return res.status(400).json({ error: 'BadRequest', message: 'q is required' });
      }

      // Code prefix match (e.g. "J06" → J06.x) OR full-text description search
      const isCodeLike = /^[A-Za-z]\d/.test(q);

      let results;
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

      return res.json({ status: 'success', data: results });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
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
