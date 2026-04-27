import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { paginate, parsePagination } from '@api/utils/paginate';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import {
  createPatientSchema,
  updatePatientSchema,
  CreatePatientDto,
  UpdatePatientDto,
} from './patients.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const PATCH_ROLES = requireRoles('NURSE', 'DOCTOR', 'CLINIC_ADMIN');

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: clinicId },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  const short = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `HW-${short}-${padded}`;
}

// GET /patients
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, string>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter: Record<string, unknown> = { isActive: true };
    if (req.query.clinicId) filter.clinicId = req.query.clinicId;

    const result = await paginate(PatientModel, filter, page, limit);
    return res.json({
      status: 'success',
      data: result.data.map(toPatientResponse),
      meta: result.meta,
    });
  }),
);

// GET /patients/search
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q || '')
      .toLowerCase()
      .trim();
    const docs = await PatientModel.find({
      clinicId: req.user!.clinicId,
      isActive: true,
      searchName: { $regex: q, $options: 'i' },
    }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toPatientResponse) });
  }),
);

// GET /patients/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// POST /patients
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createPatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreatePatientDto;
    const { firstName, lastName, ...rest } = body;
    const clinicId = req.user!.clinicId;
    const searchName = `${lastName.toLowerCase()} ${firstName.toLowerCase()}`;
    const systemId = await nextSystemId(clinicId);
    const patient = await PatientModel.create({
      ...rest,
      firstName,
      lastName,
      searchName,
      systemId,
      clinicId,
    });
    return res.status(201).json({ status: 'success', data: toPatientResponse(patient) });
  }),
);

// PATCH /patients/:id — partial update scoped to caller's clinic
router.patch(
  '/:id',
  PATCH_ROLES,
  validateRequest({ body: updatePatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as UpdatePatientDto;
    const clinicId = req.user!.clinicId;
    const { firstName, lastName, ...rest } = body;
    const update: Record<string, unknown> = { ...rest };

    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;

    if (firstName !== undefined || lastName !== undefined) {
      const existing = await PatientModel.findOne({
        _id: req.params.id,
        clinicId,
      });
      if (!existing)
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      const fn = firstName ?? existing.firstName;
      const ln = lastName ?? existing.lastName;
      update.searchName = `${ln.toLowerCase()} ${fn.toLowerCase()}`;
    }

    const updated = await PatientModel.findOneAndUpdate({ _id: req.params.id, clinicId }, update, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(updated) });
  }),
);

// DELETE /patients/:id — soft delete
router.delete(
  '/:id',
  WRITE_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({
      status: 'success',
      data: { id: String(doc._id), isActive: false },
    });
  }),
);

export const patientRoutes = router;
