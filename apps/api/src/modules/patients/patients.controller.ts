import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const ADMIN_ROLES  = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');

const ALLOWED_PATCH_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth', 'sex', 'contactNumber', 'address']);

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: clinicId },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const short  = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `HW-${short}-${padded}`;
}

// GET /patients?page=1&limit=20&clinicId=&includeInactive=true
router.get('/', async (req: Request, res: Response) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  if (Number(req.query.limit) > 100) {
    return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
  }

  const filter: Record<string, unknown> = {};
  const includeInactive = req.query.includeInactive === 'true' && ['CLINIC_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role);
  if (!includeInactive) filter.isActive = true;
  if (req.query.clinicId) filter.clinicId = req.query.clinicId;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    PatientModel.find(filter).skip(skip).limit(limit).lean(),
    PatientModel.countDocuments(filter),
  ]);
  return res.json({ status: 'success', data: data.map(toPatientResponse), meta: { total, page, limit } });
});

// GET /patients/search?q=
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const docs = await PatientModel.find({
    isActive: true,
    ...(q ? { searchName: { $regex: q, $options: 'i' } } : {}),
  }).sort({ createdAt: -1 }).lean();
  return res.json({ status: 'success', data: docs.map(toPatientResponse) });
});

// GET /patients/:id
router.get('/:id', async (req: Request, res: Response) => {
  const patient = await PatientModel.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: toPatientResponse(patient) });
});

// POST /patients
router.post('/', WRITE_ROLES, async (req: Request, res: Response) => {
  const { firstName, lastName, dateOfBirth, sex, contactNumber, address, clinicId } = req.body;
  const resolvedClinicId = clinicId || req.user!.clinicId;
  const systemId = await nextSystemId(resolvedClinicId);
  const doc = await PatientModel.create({
    systemId,
    firstName, lastName,
    searchName: `${lastName.toLowerCase()} ${firstName.toLowerCase()}`,
    dateOfBirth: new Date(dateOfBirth),
    sex, contactNumber, address,
    clinicId: resolvedClinicId,
    isActive: true,
  });
  return res.status(201).json({ status: 'success', data: toPatientResponse(doc) });
});

// PATCH /patients/:id — partial update of allowed fields only
router.patch('/:id', WRITE_ROLES, async (req: Request, res: Response) => {
  const disallowed = Object.keys(req.body).filter((k) => !ALLOWED_PATCH_FIELDS.has(k));
  if (disallowed.length > 0) {
    return res.status(400).json({ error: 'BadRequest', message: `Field(s) not updatable: ${disallowed.join(', ')}` });
  }

  const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
  const update: Record<string, unknown> = {};
  if (sex !== undefined)           update.sex           = sex;
  if (contactNumber !== undefined) update.contactNumber = contactNumber;
  if (address !== undefined)       update.address       = address;
  if (firstName !== undefined)     update.firstName     = firstName;
  if (lastName !== undefined)      update.lastName      = lastName;
  if (dateOfBirth !== undefined)   update.dateOfBirth   = new Date(dateOfBirth);

  if (firstName !== undefined || lastName !== undefined) {
    const existing = await PatientModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    const fn = firstName ?? existing.firstName;
    const ln = lastName  ?? existing.lastName;
    update.searchName = `${ln.toLowerCase()} ${fn.toLowerCase()}`;
  }

  const updated = await PatientModel.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!updated) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: toPatientResponse(updated) });
});

// DELETE /patients/:id — soft delete (CLINIC_ADMIN / SUPER_ADMIN only)
router.delete('/:id', ADMIN_ROLES, async (req: Request, res: Response) => {
  const doc = await PatientModel.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.status(204).send();
});

export const patientRoutes = router;
