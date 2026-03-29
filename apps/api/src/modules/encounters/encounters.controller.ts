import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { toEncounterResponse } from './encounters.transformer';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createEncounterSchema,
  updateEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
} from './encounter.validation';

const router = Router();
router.use(authenticate);

// POST /encounters
router.post(
  '/',
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.create(req.body);
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// GET /encounters/:id
router.get(
  '/:id',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// PATCH /encounters/:id
router.patch(
  '/:id',
  validateRequest({ params: encounterIdParamSchema, body: updateEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await EncounterModel.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  }),
);

export const encounterRoutes = router;
