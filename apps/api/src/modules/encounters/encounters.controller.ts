import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createEncounterSchema,
  updateEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
  listEncountersQuerySchema,
  ListEncountersQuery,
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
    const { patientId, doctorId, status, date, page, limit } =
      req.query as unknown as ListEncountersQuery;

    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };

    if (patientId) filter.patientId = patientId;
    if (doctorId) filter.attendingDoctorId = doctorId;
    if (status) filter.status = status;

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const skip = (page - 1) * limit;
    const [encounters, total] = await Promise.all([
      EncounterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EncounterModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: encounters.map((doc) =>
        toEncounterResponse(doc as unknown as Parameters<typeof toEncounterResponse>[0]),
      ),
      meta: { total, page, limit },
    });
  }),
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, string>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const result = await paginate(EncounterModel, { patientId: req.params.patientId }, page, limit);
    return res.json({
      status: 'success',
      data: result.data.map((doc) =>
        toEncounterResponse(doc as unknown as Parameters<typeof toEncounterResponse>[0]),
      ),
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
    return res.json({
      status: 'success',
      data: toEncounterResponse(doc as unknown as Parameters<typeof toEncounterResponse>[0]),
    });
  }),
);

// POST /encounters
router.post(
  '/',
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.create(req.body);
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
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

export const encounterRoutes = router;
