import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import { createEncounterSchema, updateEncounterSchema } from './encounter.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toEncounterResponse } from './encounters.transformer';

const router = Router();

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

export const encounterRoutes = router;
