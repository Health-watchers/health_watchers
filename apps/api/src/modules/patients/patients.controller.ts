import { Router, Request, Response } from 'express';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

const ALLOWED_PATCH_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth', 'sex', 'contactNumber', 'address']);

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: `patient_${clinicId}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `P-${counter!.value}`;
}

// GET /patients
router.get('/', async (req: Request, res: Response) => {
  try {
    const docs = await PatientModel.find({ isActive: true }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toPatientResponse) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /patients/search?q=
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    const docs = await PatientModel.find({
      isActive: true,
      searchName: { $regex: q, $options: 'i' },
    }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toPatientResponse) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /patients/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await PatientModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(doc) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /patients
router.post('/', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
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
