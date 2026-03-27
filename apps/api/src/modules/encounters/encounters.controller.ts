import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { toEncounterResponse } from './encounters.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// GET /encounters
router.get('/', async (_req: Request, res: Response) => {
  try {
    const docs = await EncounterModel.find().sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /encounters/patient/:patientId
router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const docs = await EncounterModel.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /encounters/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await EncounterModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /encounters
router.post('/', async (req: Request, res: Response) => {
  try {
    const { patientId, clinicId, chiefComplaint, notes } = req.body;
    const doc = await EncounterModel.create({ patientId, clinicId, chiefComplaint, notes });
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// PATCH /encounters/:id — update notes, diagnosis, treatmentPlan, aiSummary
router.patch('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const { notes, diagnosis, treatmentPlan, aiSummary } = req.body;
    const update: Record<string, any> = {};
    if (notes !== undefined)         update.notes         = notes;
    if (diagnosis !== undefined)     update.diagnosis     = diagnosis;
    if (treatmentPlan !== undefined) update.treatmentPlan = treatmentPlan;
    if (aiSummary !== undefined)     update.aiSummary     = aiSummary;

    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// DELETE /encounters/:id — soft delete
router.delete('/:id', authenticate, WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

export const encounterRoutes = router;
