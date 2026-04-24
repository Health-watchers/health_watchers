import { Router, Request, Response } from 'express';
import { EncounterModel, Prescription } from './encounter.model';
import { toEncounterResponse } from './encounters.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createEncounterSchema,
  patchEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
  listEncountersQuerySchema,
  ListEncountersQuery,
} from './encounter.validation';
import { Types } from 'mongoose';
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

// GET /encounters
// GET /encounters — paginated list scoped to the authenticated clinic
router.get(
  '/',
  validateRequest({ query: listEncountersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, patientId, status } = req.query as unknown as ListEncountersQuery;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId, isActive: true };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      EncounterModel.find(filter)
        .populate('patientId', 'firstName lastName systemId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    const { patientId, doctorId, status, date, page, limit } =
      req.query as unknown as ListEncountersQuery;

    const filter: Record<string, unknown> = {
      clinicId: req.user!.clinicId,
      isActive: true,
    };
    if (patientId) filter.patientId = patientId;
    if (doctorId) filter.attendingDoctorId = doctorId;
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      EncounterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EncounterModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: docs.map(toEncounterResponse),
      meta: { total, page, limit },
    });
  }),
);

// POST /encounters
router.post(
  '/',
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'NURSE'),
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
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  }),
);

// PATCH /encounters/:id — only DOCTOR (own) or CLINIC_ADMIN; closed encounters → 409
router.patch(
  '/:id',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema, body: patchEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (encounter.status === 'closed' || encounter.status === 'cancelled') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot edit a ${encounter.status} encounter`,
      });
    }

    // DOCTOR can only edit their own encounters
    if (
      req.user!.role === 'DOCTOR' &&
      String(encounter.attendingDoctorId) !== req.user!.userId
    ) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only edit your own encounters' });
    }

    const allowedFields = ['chiefComplaint', 'notes', 'aiSummary', 'diagnosis', 'treatmentPlan', 'vitalSigns', 'prescriptions', 'followUpDate', 'status'] as const;
    const updateData: Record<string, unknown> = {};
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

    return res.json({ status: 'success', data: toEncounterResponse(doc!) });
  }),
);

// DELETE /encounters/:id — soft-delete via status:'cancelled'; CLINIC_ADMIN or SUPER_ADMIN only
router.delete(
  '/:id',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    const doc = await EncounterModel.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', isActive: false },
      { new: true },
    );

    return res.json({ status: 'success', message: 'Encounter cancelled', data: toEncounterResponse(doc!) });
  }),
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await EncounterModel.find({
      patientId: req.params.patientId,
      clinicId: req.user!.clinicId,
      isActive: true,
    }).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: docs.map(toEncounterResponse) });
  }),
);

// ============================================================================
// PRESCRIPTION ENDPOINTS
// ============================================================================

// POST /encounters/:id/prescriptions - Add prescription to encounter
router.post(
  '/:id/prescriptions',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    const prescription: Prescription = {
      ...req.body,
      prescribedBy: req.user!._id,
      prescribedAt: new Date(),
    };

    encounter.prescriptions = encounter.prescriptions || [];
    encounter.prescriptions.push(prescription);
    await encounter.save();

    return res.status(201).json({ 
      status: 'success', 
      data: toEncounterResponse(encounter),
      message: 'Prescription added successfully'
    });
  }),
);

// GET /encounters/:id/prescriptions - List prescriptions for encounter
router.get(
  '/:id/prescriptions',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      isActive: true,
    }).populate('prescriptions.prescribedBy', 'firstName lastName');

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    return res.json({ 
      status: 'success', 
      data: encounter.prescriptions || []
    });
  }),
);

// DELETE /encounters/:id/prescriptions/:prescriptionId - Remove prescription
router.delete(
  '/:id/prescriptions/:prescriptionId',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (!encounter.prescriptions || encounter.prescriptions.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'No prescriptions found' });
    }

    const prescriptionId = req.params.prescriptionId;
    const initialLength = encounter.prescriptions.length;
    
    encounter.prescriptions = encounter.prescriptions.filter(
      (p: any) => p._id.toString() !== prescriptionId
    );

    if (encounter.prescriptions.length === initialLength) {
      return res.status(404).json({ error: 'NotFound', message: 'Prescription not found' });
    }

    await encounter.save();

    return res.json({ 
      status: 'success', 
      message: 'Prescription removed successfully',
      data: toEncounterResponse(encounter)
    });
  }),
);

export const encounterRoutes = router;
