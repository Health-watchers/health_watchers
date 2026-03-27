import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import { createEncounterSchema, updateEncounterSchema } from './encounter.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toEncounterResponse } from './encounters.transformer';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middlewares/validate.middleware';
import { paginate, parsePagination } from '../../utils/paginate';
import {
  createEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
} from './encounter.validation';

const router = Router();

// GET /encounters
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const docs = await EncounterModel.find().sort({ createdAt: -1 });
  return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
}));

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const result = await paginate(EncounterModel, { patientId: req.params.patientId }, page, limit);
    return res.json({ status: 'success', data: result.data.map(toEncounterResponse), meta: result.meta });
  })
);

// GET /encounters/:id
router.get(
  '/:id',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  })
);

// POST /encounters
router.post(
  '/',
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, clinicId, chiefComplaint, notes } = req.body;
    const doc = await EncounterModel.create({ patientId, clinicId, chiefComplaint, notes });
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  })
router.post(
  '/',
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.create(req.body);
    res.status(201).json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const encounters = await EncounterModel.find().sort({ createdAt: -1 }).lean();
    res.json({ status: 'success', data: encounters.map(toEncounterResponse) });
  }),
);

router.get(
  '/patient/:patientId',
  asyncHandler(async (req: Request, res: Response) => {
    const encounters = await EncounterModel.find({ patientId: req.params.patientId }).sort({ createdAt: -1 }).lean();
    res.json({ status: 'success', data: encounters.map(toEncounterResponse) });
  }),
);

router.get(
  '/:id',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findById(req.params.id).lean();
    if (!encounter) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

router.patch(
  '/:id',
  validateRequest({ params: objectIdSchema, body: updateEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!encounter) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

// PATCH /encounters/:id — update notes, diagnosis, treatmentPlan, aiSummary
router.patch('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const { notes, diagnosis, treatmentPlan, aiSummary } = req.body;
    const update: Record<string, any> = {};
    if (notes !== undefined)         update.notes         = notes;
    if (diagnosis !== undefined)     update.diagnosis     = diagnosis;
    if (treatmentPlan !== undefined) update.treatmentPlan = treatmentPlan;
    if (aiSummary !== undefined)     update.aiSummary     = aiSummary;

    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// DELETE /encounters/:id — soft delete
router.delete('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

export const encounterRoutes = router;
