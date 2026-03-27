import { Router, Request, Response, NextFunction } from 'express';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginate, parsePagination } from '../../utils/paginate';
import { Request, Response, Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

const ALLOWED_PATCH_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth', 'sex', 'contactNumber', 'address']);

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const short = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `HW-${short}-${padded}`;
}

// GET /patients?page=1&limit=20&clinicId=
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query as Record<string, any>);
  if (!pagination) {
    return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
  }
  const { page, limit } = pagination;
  const filter: Record<string, any> = { isActive: true };
  if (req.query.clinicId) filter.clinicId = req.query.clinicId;

  const result = await paginate(PatientModel, filter, page, limit);
  return res.json({ status: 'success', data: result.data.map(toPatientResponse), meta: result.meta });
}));

// GET /patients/search?q=
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
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
}));

// GET /patients/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await PatientModel.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: toPatientResponse(doc) });
}));

// POST /patients
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, dateOfBirth, sex, contactNumber, address, clinicId } = req.body;
  const searchName = `${firstName} ${lastName}`.toLowerCase();
  const systemId = await nextSystemId(clinicId || 'default');
  const doc = await PatientModel.create({
    systemId, firstName, lastName,
    dateOfBirth: new Date(dateOfBirth),
    sex, contactNumber, address,
    clinicId: clinicId || 'default',
    isActive: true,
    searchName,
  });
  return res.status(201).json({ status: 'success', data: toPatientResponse(doc) });
}));

// PUT /patients/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
  const update: Record<string, any> = { contactNumber, address, sex };
  if (firstName) { update.firstName = firstName; }
  if (lastName)  { update.lastName  = lastName;  }
  if (firstName || lastName) {
    update.searchName = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
  }
  if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);

  const doc = await PatientModel.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: toPatientResponse(doc) });
}));
router.post('/', validateRequest({ body: createPatientSchema }), async (req: Request<Record<string, never>, unknown, CreatePatientDto>, res: Response) => {
  const { firstName, lastName, ...rest } = req.body;
  const clinicId = req.user!.clinicId;
  const searchName = `${lastName.toLowerCase()} ${firstName.toLowerCase()}`;
  const systemId = await generateSystemId(clinicId);

  const patient = await PatientModel.create({ ...rest, firstName, lastName, searchName, systemId, clinicId });
  return res.status(201).json({ status: 'success', data: patient });
});

router.get('/', async (req: Request, res: Response) => {
  const { q, page = '1', limit = '20' } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { clinicId: req.user!.clinicId, isActive: true };
  if (q) filter.searchName = { $regex: q.toLowerCase(), $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [patients, total] = await Promise.all([
    PatientModel.find(filter).skip(skip).limit(Number(limit)).lean(),
    PatientModel.countDocuments(filter),
  ]);
  return res.json({ status: 'success', data: patients, meta: { total, page: Number(page), limit: Number(limit) } });
});

router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const docs = await PatientModel.find({
    clinicId: req.user!.clinicId,
    isActive: true,
    searchName: { $regex: q, $options: 'i' },
  }).sort({ createdAt: -1 });
  return res.json({ status: 'success', data: docs });
});

router.get('/:id', async (req: Request, res: Response) => {
  const patient = await PatientModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
  if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: patient });
});

router.patch('/:id', validateRequest({ body: updatePatientSchema }), async (req: Request<{ id: string }, unknown, UpdatePatientDto>, res: Response) => {
  const { firstName, lastName, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest };
  if (firstName) update.firstName = firstName;
  if (lastName)  update.lastName  = lastName;
  // Keep searchName in sync whenever name fields change
  if (firstName || lastName) {
    const existing = await PatientModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!existing) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    const fn = firstName ?? existing.firstName;
    const ln = lastName  ?? existing.lastName;
    update.searchName = `${ln.toLowerCase()} ${fn.toLowerCase()}`;
  }
});

// PATCH /patients/:id — partial update of allowed fields only
router.patch('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const disallowed = Object.keys(req.body).filter((k) => !ALLOWED_PATCH_FIELDS.has(k));
    if (disallowed.length > 0) {
      return res.status(400).json({ error: 'BadRequest', message: `Field(s) not updatable: ${disallowed.join(', ')}` });
    }

    const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
    const update: Record<string, any> = {};
    if (sex !== undefined)           update.sex           = sex;
    if (contactNumber !== undefined) update.contactNumber = contactNumber;
    if (address !== undefined)       update.address       = address;
    if (firstName !== undefined)     update.firstName     = firstName;
    if (lastName !== undefined)      update.lastName      = lastName;
    if (dateOfBirth !== undefined)   update.dateOfBirth   = new Date(dateOfBirth);
    if (firstName !== undefined || lastName !== undefined) {
      const doc = await PatientModel.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      update.searchName = `${firstName ?? doc.firstName} ${lastName ?? doc.lastName}`.toLowerCase().trim();
    }

    const updated = await PatientModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(updated) });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// DELETE /patients/:id — soft delete
router.delete('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const doc = await PatientModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

export const patientRoutes = router;
