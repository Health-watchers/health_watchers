import { Router, Request, Response } from 'express';
import { ICD10Model } from './icd10.model';
import { authenticate } from '@api/middlewares/auth.middleware';

export const icd10Routes = Router();
icd10Routes.use(authenticate);

// Simple in-memory cache: query → results (ICD-10 codes rarely change)
const cache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

// GET /api/v1/icd10/search?q=<query>&limit=10
icd10Routes.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));

    if (!q) {
      return res.status(400).json({ error: 'BadRequest', message: 'q is required' });
    }

    const cacheKey = `${q}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ status: 'success', data: cached });

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
        { score: { $meta: 'textScore' } },
      )
        .select('code description category chapter')
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean();
    }

    cache.set(cacheKey, { data: results, ts: Date.now() });
    return res.json({ status: 'success', data: results });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /api/v1/icd10/:code — validate a single code
icd10Routes.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code.toUpperCase();
    const doc = await ICD10Model.findOne({ code, isValid: true }).select('code description').lean();
    if (!doc) return res.status(404).json({ error: 'NotFound', message: `ICD-10 code '${code}' not found` });
    return res.json({ status: 'success', data: doc });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
