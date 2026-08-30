import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import {
  assignBillingCodes,
  matchCptFromCatalog,
  matchSnomedForDiagnosis,
  CPT_CATALOG,
} from './billing-code.service';
import { CPTModel } from '../cpt/cpt.model';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

const diagnosisSchema = z.object({
  code: z.string().min(1, 'Diagnosis code is required'),
  description: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const assignCodesSchema = z.object({
  diagnoses: z.array(diagnosisSchema).optional(),
  procedures: z.array(z.string().min(1)).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

// POST /billing/codes/assign — assign CPT + SNOMED codes from diagnoses/procedures
router.post(
  '/assign',
  WRITE_ROLES,
  validateRequest({ body: assignCodesSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { diagnoses, procedures } = req.body;

    const assignment = await assignBillingCodes({ diagnoses, procedures });

    return res.status(201).json({ status: 'success', data: assignment });
  })
);

// GET /billing/codes/cpt/search?q= — search the CPT reference table
router.get(
  '/cpt/search',
  validateRequest({ query: searchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query as { q: string };

    let results: unknown[] = [];
    try {
      results = await CPTModel.find({ $text: { $search: q } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(10)
        .lean();
    } catch {
      // Text index unavailable — fall back to catalog keyword matching
      const catalogMatch = matchCptFromCatalog(q);
      results = catalogMatch ? [catalogMatch] : [];
    }

    return res.json({ status: 'success', data: results });
  })
);

// GET /billing/codes/snomed/search?q= — match a diagnosis to a SNOMED concept
router.get(
  '/snomed/search',
  validateRequest({ query: searchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query as { q: string };

    const match = matchSnomedForDiagnosis({ code: q, description: q });
    const data = match ? [match] : [];

    return res.json({ status: 'success', data });
  })
);

// GET /billing/codes/catalog — list the built-in reference catalog
router.get('/catalog', (_req: Request, res: Response) => {
  return res.json({ status: 'success', data: CPT_CATALOG });
});

export const billingCodeRoutes = router;
