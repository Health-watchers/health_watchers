import { Request, Response, Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { createPatientSchema, updatePatientSchema, CreatePatientDto, UpdatePatientDto } from './patients.validation';

const router = Router();
router.use(authenticate);

/** Atomically generate the next systemId for a clinic. Format: HW-{clinicShort}-{paddedNumber} */
async function generateSystemId(clinicId: string): Promise<string> {
  const key = `patient_${clinicId}`;
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const short = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `HW-${short}-${padded}`;
}

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

  const patient = await PatientModel.findOneAndUpdate(
    { _id: req.params.id, clinicId: req.user!.clinicId },
    update,
    { new: true }
  );
  if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: patient });
});

export { router as patientRoutes };
