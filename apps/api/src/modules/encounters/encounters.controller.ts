import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
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
import { paginate, parsePagination } from '@api/utils/paginate';
import { auditLog } from '@api/middlewares/audit.middleware';

const router = Router();
router.use(authenticate);
router.use(auditLog('Encounter'));

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

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

// GET /encounters/patient/:patientId — MUST be before /:id to avoid route shadowing
router.get(
  '/patient/:patientId',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    
    const filter = { 
      patientId: req.params.patientId, 
      clinicId: req.user!.clinicId 
    };
    
    const result = await paginate(EncounterModel, filter, page, limit, { createdAt: -1 });
    
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
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({ 
      _id: req.params.id, 
      clinicId: req.user!.clinicId 
    }).lean();
    
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }
    
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

// POST /encounters
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.create({
      ...req.body,
      clinicId: req.user!.clinicId,
    });
    res.status(201).json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

// PATCH /encounters/:id
router.patch(
  '/:id',
  WRITE_ROLES,
  validateRequest({ params: objectIdSchema, body: updateEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      req.body,
      { new: true, runValidators: true },
    ).lean();
    
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }
    
    res.json({ status: 'success', data: toEncounterResponse(encounter) });
  }),
);

export const encounterRoutes = router;
