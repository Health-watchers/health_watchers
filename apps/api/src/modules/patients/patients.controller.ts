import { Request, Response, Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import { asyncHandler, parsePagination, paginatedResponse, sendSuccess, sendError } from '@health-watchers/utils';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import {
  createPatientSchema,
  patientIdParamsSchema,
  patientSearchQuerySchema,
  CreatePatientDto,
  PatientIdParamsDto,
  PatientSearchQueryDto,
} from './patients.validation';

const router = Router();

const nextSystemId = async (clinicId: string) => {
  const counter = await PatientCounterModel.findByIdAndUpdate(
    `patient:${clinicId}`,
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  return `P-${String(counter.value).padStart(6, '0')}`;
};

// POST /api/v1/patients
router.post(
  '/',
  authenticate,
  validateRequest({ body: createPatientSchema }),
  asyncHandler(async (req: Request<Record<string, never>, unknown, CreatePatientDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return sendError(res, 401, 'Unauthorized', 'Missing clinic context');

    const { firstName, lastName } = req.body;
    const patient = await PatientModel.create({
      ...req.body,
      clinicId,
      systemId: await nextSystemId(clinicId),
      searchName: `${firstName} ${lastName}`.toLowerCase(),
    });
    return sendSuccess(res, patient, 201);
  })
);

// GET /api/v1/patients/search?q=&page=&limit=
router.get(
  '/search',
  authenticate,
  validateRequest({ query: patientSearchQuerySchema }),
  asyncHandler(async (req: Request<Record<string, never>, unknown, unknown, PatientSearchQueryDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    const { q } = req.query;
    const { page, limit, skip } = parsePagination(req.query as unknown as Record<string, unknown>);

    const filter = { clinicId, isActive: true, $text: { $search: q } };
    const [results, total] = await Promise.all([
      PatientModel.find(filter).skip(skip).limit(limit).lean(),
      PatientModel.countDocuments(filter),
    ]);
    return sendSuccess(res, paginatedResponse(results, total, page, limit));
  })
);

// GET /api/v1/patients/:id
router.get(
  '/:id',
  authenticate,
  validateRequest({ params: patientIdParamsSchema }),
  asyncHandler(async (req: Request<PatientIdParamsDto>, res: Response) => {
    const clinicId = req.user?.clinicId;
    const patient = await PatientModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!patient) return sendError(res, 404, 'NotFound', 'Patient not found');
    return sendSuccess(res, patient);
  })
);

export const patientRoutes = router;
