import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { paginate } from '../../utils/paginate';
import { EncounterModel } from './encounter.model';
import { toEncounterResponse } from './encounters.transformer';
import {
  createEncounterSchema,
  updateEncounterSchema,
  encounterIdParamSchema,
  listEncountersQuerySchema,
  prescriptionIdParamSchema,
  prescriptionSchema,
} from './encounter.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// GET /encounters?page=1&limit=20&patientId=&doctorId=&status=&date=
router.get(
  '/',
  validateRequest({ query: listEncountersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, patientId, doctorId, status, date } = req.query as any;

    const filter: Record<string, any> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (doctorId)  filter.attendingDoctorId = doctorId;
    if (status)    filter.status = status;
    if (date) {
      const start = new Date(date);
      const end   = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

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
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// POST /encounters
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    if (data.followUpDate) data.followUpDate = new Date(data.followUpDate);

    const doc = await EncounterModel.create(data);
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// PATCH /encounters/:id
router.patch(
  '/:id',
  WRITE_ROLES,
  validateRequest({ params: encounterIdParamSchema, body: updateEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    if (data.followUpDate) data.followUpDate = new Date(data.followUpDate);

    const doc = await EncounterModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      data,
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// DELETE /encounters/:id
router.delete(
  '/:id',
  WRITE_ROLES,
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findOneAndDelete({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: { id: String(doc._id) } });
  }),
);

// POST /encounters/:id/prescriptions
router.post(
  '/:id/prescriptions',
  WRITE_ROLES,
  validateRequest({ params: encounterIdParamSchema, body: prescriptionSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      { $push: { prescriptions: req.body } },
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// DELETE /encounters/:id/prescriptions/:prescriptionId
router.delete(
  '/:id/prescriptions/:prescriptionId',
  WRITE_ROLES,
  validateRequest({ params: prescriptionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      { $pull: { prescriptions: { _id: req.params.prescriptionId } } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

export const encounterRoutes = router;
