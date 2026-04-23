import { Router, Request, Response } from 'express';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginate, parsePagination } from '../../utils/paginate';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { toPaymentResponse } from '../payments/payments.transformer';
import { EncounterModel } from '../encounters/encounter.model';
import { toEncounterResponse } from '../encounters/encounters.transformer';
import {
  createPatientSchema,
  updatePatientSchema,
  patientQuerySchema,
  patientSearchQuerySchema,
} from './patients.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');

const ALLOWED_PATCH_FIELDS = new Set([
  'firstName',
  'lastName',
  'dateOfBirth',
  'sex',
  'contactNumber',
  'address',
]);

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

// GET /patients?page=1&limit=20&clinicId=
router.get(
  '/',
  validateRequest({ query: patientQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter: Record<string, any> = { isActive: true };
    if (req.query.clinicId) filter.clinicId = req.query.clinicId;

    const result = await paginate(PatientModel, filter, page, limit);
    return res.json({ status: 'success', data: result.data.map(toPatientResponse), meta: result.meta });
  }),
);

// GET /patients/search?q=
router.get(
  '/search',
  validateRequest({ query: patientSearchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const q = String(req.query.q || '').trim();
    const filter: Record<string, any> = { isActive: true };
    if (q) filter.searchName = { $regex: q, $options: 'i' };

    const result = await paginate(PatientModel, filter, page, limit);
    return res.json({ status: 'success', data: result.data.map(toPatientResponse), meta: result.meta });
  }),
);

// GET /patients/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findById(req.params.id);
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
    const { firstName, lastName, dateOfBirth, sex, contactNumber, address, clinicId } = req.body;
    const searchName = `${firstName} ${lastName}`.toLowerCase();
    const systemId = await nextSystemId(clinicId || req.user!.clinicId);
    const doc = await PatientModel.create({
      systemId,
      firstName,
      lastName,
      dateOfBirth: new Date(dateOfBirth),
      sex,
      contactNumber,
      address,
      clinicId: clinicId || req.user!.clinicId,
      isActive: true,
      searchName,
    });
    return res.status(201).json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// PUT /patients/:id
router.put(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: createPatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
    const update: Record<string, any> = { contactNumber, address, sex };
    if (firstName) update.firstName = firstName;
    if (lastName) update.lastName = lastName;
    if (firstName || lastName) {
      update.searchName = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
    }
    if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);

    const doc = await PatientModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// PATCH /patients/:id — partial update of allowed fields only
router.patch(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: updatePatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const disallowed = Object.keys(req.body).filter((k) => !ALLOWED_PATCH_FIELDS.has(k));
    if (disallowed.length > 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Field(s) not updatable: ${disallowed.join(', ')}`,
      });
    }

    const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
    const update: Record<string, any> = {};
    if (sex !== undefined) update.sex = sex;
    if (contactNumber !== undefined) update.contactNumber = contactNumber;
    if (address !== undefined) update.address = address;
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (dateOfBirth !== undefined) update.dateOfBirth = new Date(dateOfBirth);

    if (firstName !== undefined || lastName !== undefined) {
      const doc = await PatientModel.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      update.searchName = `${firstName ?? doc.firstName} ${lastName ?? doc.lastName}`
        .toLowerCase()
        .trim();
    }

    const updated = await PatientModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      update,
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(updated) });
  }),
);

// DELETE /patients/:id — soft delete
router.delete(
  '/:id',
  ADMIN_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
  }),
);

// GET /patients/:id/payments
router.get(
  '/:id/payments',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;

    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const result = await paginate(
      PaymentRecordModel,
      { patientId: req.params.id, clinicId: req.user!.clinicId },
      page,
      limit,
    );
    return res.json({ status: 'success', data: result.data.map(toPaymentResponse), meta: result.meta });
  }),
);

// GET /patients/:id/encounters
router.get(
  '/:id/encounters',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;

    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const result = await paginate(
      EncounterModel,
      { patientId: req.params.id, clinicId: req.user!.clinicId, isActive: true },
      page,
      limit,
      { createdAt: -1 },
    );
    return res.json({ status: 'success', data: result.data.map(toEncounterResponse), meta: result.meta });
  }),
);

export const patientRoutes = router;
