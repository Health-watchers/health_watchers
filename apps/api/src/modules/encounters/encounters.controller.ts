import { Request, Response, Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import { asyncHandler, parsePagination, paginatedResponse, sendSuccess, sendError } from '@health-watchers/utils';
import { EncounterModel } from './encounter.model';
import {
  createEncounterSchema,
  encounterIdParamsSchema,
  patientEncountersParamsSchema,
  paginationQuerySchema,
  CreateEncounterDto,
  EncounterIdParamsDto,
  PatientEncountersParamsDto,
  PaginationQueryDto,
} from './encounters.validation';

const router = Router();

// POST /api/v1/encounters
router.post(
  '/',
  authenticate,
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request<Record<string, never>, unknown, CreateEncounterDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return sendError(res, 401, 'Unauthorized', 'Missing clinic context');

    const encounter = await EncounterModel.create({ ...req.body, clinicId });
    return sendSuccess(res, encounter, 201);
  })
);

// GET /api/v1/encounters/:id
router.get(
  '/:id',
  authenticate,
  validateRequest({ params: encounterIdParamsSchema }),
  asyncHandler(async (req: Request<EncounterIdParamsDto>, res: Response) => {
    const encounter = await EncounterModel.findOne({ _id: req.params.id, clinicId: req.user?.clinicId }).lean();
    if (!encounter) return sendError(res, 404, 'NotFound', 'Encounter not found');
    return sendSuccess(res, encounter);
  })
);

// GET /api/v1/encounters/patient/:patientId?page=&limit=
router.get(
  '/patient/:patientId',
  authenticate,
  validateRequest({ params: patientEncountersParamsSchema, query: paginationQuerySchema }),
  asyncHandler(async (req: Request<PatientEncountersParamsDto, unknown, unknown, PaginationQueryDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    const { page, limit, skip } = parsePagination(req.query as unknown as Record<string, unknown>);
    const filter = { patientId: req.params.patientId, clinicId };

    const [encounters, total] = await Promise.all([
      EncounterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EncounterModel.countDocuments(filter),
    ]);
    return sendSuccess(res, paginatedResponse(encounters, total, page, limit));
  })
);

export const encounterRoutes = router;
