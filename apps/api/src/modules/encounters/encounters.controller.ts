import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import { asyncHandler } from '@api/middlewares/async.handler';
import {
  createEncounterSchema,
  updateEncounterSchema,
  listEncountersQuerySchema,
  ListEncountersQuery,
} from './encounter.validation';
import { toEncounterResponse } from './encounters.transformer';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middlewares/validate.middleware';
import { paginate, parsePagination } from '../../utils/paginate';
import {
  createEncounterSchema,
  updateEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
} from './encounter.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toEncounterResponse } from './encounters.transformer';
import { paginate, parsePagination } from '@api/utils/paginate';

const router = Router();
router.use(authenticate);

// GET /encounters — paginated list scoped to the authenticated clinic
router.get(
  '/',
  validateRequest({ query: listEncountersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, doctorId, status, date, page, limit } = req.query as unknown as ListEncountersQuery;

    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };

    if (patientId) filter.patientId         = patientId;
    if (doctorId)  filter.attendingDoctorId = doctorId;
    if (status)    filter.status            = status;

    if (date) {
      const start = new Date(date);
      const end   = new Date(date);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const skip = (page - 1) * limit;
    const [encounters, total] = await Promise.all([
      EncounterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EncounterModel.countDocuments(filter),
    ]);

    res.json({
      status: 'success',
      data: encounters.map(toEncounterResponse),
      meta: { total, page, limit },
    });
  }),
);

// GET /encounters
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const docs = await EncounterModel.find().sort({ createdAt: -1 }).lean();
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  }),
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const result = await paginate(EncounterModel, { patientId: req.params.patientId }, page, limit);
    return res.json({
      status: 'success',
      data: result.data.map(toEncounterResponse),
      meta: result.meta,
    });
  }),
);

// GET /encounters/:id
router.get(
  '/:id',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
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
  '/patient/:patientId',
  asyncHandler(async (req: Request, res: Response) => {
    const encounters = await EncounterModel
      .find({ patientId: req.params.patientId, clinicId: req.user!.clinicId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ status: 'success', data: encounters.map(toEncounterResponse) });
  }),
);

router.get(
  '/:id',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId }).lean();
    if (!encounter) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

// PATCH /encounters/:id
router.patch(
  '/:id',
  validateRequest({ params: encounterIdParamSchema, body: updateEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      req.body,
      { new: true, runValidators: true },
    ).lean();
    if (!encounter) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

// PATCH /encounters/:id — update notes, diagnosis, treatmentPlan, aiSummary
router.patch('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const { notes, diagnosis, treatmentPlan, aiSummary } = req.body;
    const update: Record<string, any> = {};
    if (notes !== undefined) update.notes = notes;
    if (diagnosis !== undefined) update.diagnosis = diagnosis;
    if (treatmentPlan !== undefined) update.treatmentPlan = treatmentPlan;
    if (aiSummary !== undefined) update.aiSummary = aiSummary;

    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

export const encounterRoutes = router;
