import { Router, Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { toEncounterResponse } from './encounters.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createEncounterSchema,
  patchEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
} from './encounter.validation';
import { ICD10Model } from '../icd10/icd10.model';

async function validateDiagnosisCodes(diagnoses?: { code: string }[]): Promise<string | null> {
  if (!diagnoses || diagnoses.length === 0) return null;
  for (const d of diagnoses) {
    const exists = await ICD10Model.exists({ code: d.code.toUpperCase(), isValid: true });
    if (!exists) return d.code;
  }
  return null;
}

const router = Router();
router.use(authenticate);

// POST /encounters
router.post(
  '/',
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invalidCode = await validateDiagnosisCodes(req.body.diagnosis);
    if (invalidCode) {
      return res.status(400).json({ error: 'BadRequest', message: `Invalid ICD-10 code: '${invalidCode}'` });
    }
    const doc = await EncounterModel.create(req.body);
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// GET /encounters/:id
router.get(
  '/:id',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await EncounterModel.findOne({ 
      _id: req.params.id, 
      isActive: true 
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// PATCH /encounters/:id
// Restricted to DOCTOR and CLINIC_ADMIN roles
// Only allows updating: chiefComplaint, notes, aiSummary, diagnosis, treatmentPlan
router.patch(
  '/:id',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema, body: patchEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    // Ensure caller can only update encounters in their clinic
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    // Update only allowed fields
    const allowedFields = ['chiefComplaint', 'notes', 'aiSummary', 'diagnosis', 'treatmentPlan'] as const;
    const updateData: Record<string, any> = {};
    
    for (const field of allowedFields) {
      if (field in req.body && req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.diagnosis) {
      const invalidCode = await validateDiagnosisCodes(updateData.diagnosis);
      if (invalidCode) {
        return res.status(400).json({ error: 'BadRequest', message: `Invalid ICD-10 code: '${invalidCode}'` });
      }
    }

    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });
    
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }
    
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// DELETE /encounters/:id
// Soft-delete: marks encounter as inactive
// Restricted to CLINIC_ADMIN role only
router.delete(
  '/:id',
  requireRoles('CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    // Ensure caller can only delete encounters in their clinic
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    // Soft-delete by setting isActive to false
    const doc = await EncounterModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    return res.json({ status: 'success', message: 'Encounter deleted', data: toEncounterResponse(doc!) });
  }),
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await EncounterModel.find({ 
      patientId: req.params.patientId,
      isActive: true 
    }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  }),
);

export const encounterRoutes = router;
