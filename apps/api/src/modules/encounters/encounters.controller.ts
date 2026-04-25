import { Router, Request, Response } from 'express';
import { EncounterModel, Prescription } from './encounter.model';
import { EncounterTemplateModel } from './encounter-template.model';
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
import { PatientModel } from '../patients/models/patient.model';
import { auditLog } from '../audit/audit.service';
import { emitToClinic } from '@api/realtime/socket';
import { encountersCreatedTotal } from '../../services/metrics.service';

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

// GET /encounters — paginated list scoped to the authenticated clinic
// Supports: q (full-text), patientId, doctorId, status, date, dateFrom, dateTo,
//           diagnosisCode, hasAiSummary, hasPrescriptions, sort, page, limit
router.get(
  '/',
  validateRequest({ query: listEncountersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      patientId,
      doctorId,
      status,
      date,
      q,
      diagnosisCode,
      dateFrom,
      dateTo,
      hasAiSummary,
      hasPrescriptions,
      sort,
      page,
      limit,
    } = req.query as unknown as ListEncountersQuery;

    const clinicId = req.user!.clinicId;

    // ── Build aggregation pipeline ────────────────────────────────────────────
    const matchStage: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
    };

    if (patientId) matchStage.patientId = new Types.ObjectId(patientId);
    if (doctorId) matchStage.attendingDoctorId = new Types.ObjectId(doctorId);
    if (status) matchStage.status = status;

    // Single-day filter (legacy `date` param)
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      matchStage.createdAt = { $gte: start, $lt: end };
    }

    // Date range filter (dateFrom / dateTo)
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        range.$lt = end;
      }
      matchStage.createdAt = range;
    }

    // ICD-10 diagnosis code filter
    if (diagnosisCode) {
      matchStage['diagnosis.code'] = diagnosisCode.toUpperCase();
    }

    // Boolean filters
    if (hasAiSummary === true) {
      matchStage.aiSummary = { $exists: true, $ne: null, $ne: '' };
    }
    if (hasPrescriptions === true) {
      matchStage['prescriptions.0'] = { $exists: true };
    }

    // Full-text search
    if (q && q.trim().length > 0) {
      matchStage.$text = { $search: q.trim() };
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    let sortStage: Record<string, 1 | -1 | { $meta: string }> = { createdAt: -1 };
    if (sort === 'createdAt_asc') sortStage = { createdAt: 1 };
    else if (sort === 'patientName_asc') sortStage = { 'patientInfo.firstName': 1 };
    // Add text score sort when doing full-text search
    if (q && q.trim().length > 0) {
      sortStage = { score: { $meta: 'textScore' }, ...sortStage };
    }

    const skip = (page - 1) * limit;

    // ── Aggregation pipeline with patient name lookup ─────────────────────────
    const pipeline: object[] = [
      { $match: matchStage },
      ...(q ? [{ $addFields: { score: { $meta: 'textScore' } } }] : []),
      {
        $lookup: {
          from: 'patients',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patientInfo',
          pipeline: [{ $project: { firstName: 1, lastName: 1, systemId: 1 } }],
        },
      },
      { $unwind: { path: '$patientInfo', preserveNullAndEmpty: true } },
      { $sort: sortStage },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await EncounterModel.aggregate(pipeline).exec();
    const docs = result?.data ?? [];
    const total = result?.meta?.[0]?.total ?? 0;

    return res.json({
      status: 'success',
      data: docs.map((doc: any) => ({
        ...toEncounterResponse(doc),
        // Include patient name from lookup
        patient: doc.patientInfo
          ? {
              firstName: doc.patientInfo.firstName,
              lastName: doc.patientInfo.lastName,
              systemId: doc.patientInfo.systemId,
            }
          : undefined,
      })),
      meta: { total, page, limit },
    });
  }),
);

// POST /encounters
// Optional query param: ?templateId=<id> — pre-fills fields from template, doctor values take precedence
router.post(
  '/',
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'NURSE'),
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    // Merge template defaults (request body overrides template)
    const { templateId } = req.query;
    if (templateId && typeof templateId === 'string') {
      const template = await EncounterTemplateModel.findOne({
        _id: templateId,
        clinicId: req.user!.clinicId,
        isActive: true,
      });
      if (template) {
        if (!req.body.chiefComplaint && template.defaultChiefComplaint) {
          req.body.chiefComplaint = template.defaultChiefComplaint;
        }
        if (!req.body.vitalSigns && template.defaultVitalSigns) {
          req.body.vitalSigns = template.defaultVitalSigns;
        }
        if (!req.body.diagnosis?.length && template.suggestedDiagnoses?.length) {
          req.body.diagnosis = template.suggestedDiagnoses.map((d, i) => ({ ...d, isPrimary: i === 0 }));
        }
        if (!req.body.notes && template.notes) {
          req.body.notes = template.notes;
        }
        // Increment usage count (non-blocking)
        EncounterTemplateModel.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } }).exec();
      }
    }

    const invalidCode = await validateDiagnosisCodes(req.body.diagnosis);
    if (invalidCode) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: `Invalid ICD-10 code: '${invalidCode}'` });
    }

    // Allergy check for prescriptions
    if (req.body.prescriptions?.length && req.body.patientId) {
      const patient = await PatientModel.findById(req.body.patientId).select('allergies').lean();
      const activeAllergies = (patient?.allergies ?? []).filter((a: any) => a.isActive && a.allergenType === 'drug');

      for (const rx of req.body.prescriptions as Array<{ drugName: string; allergyOverride?: { allergyId: string; reason: string } }>) {
        const match = activeAllergies.find((a: any) =>
          rx.drugName.toLowerCase().includes(a.allergen.toLowerCase()) ||
          a.allergen.toLowerCase().includes(rx.drugName.toLowerCase()),
        );
        if (match) {
          const overrideId = rx.allergyOverride?.allergyId;
          const hasOverride = overrideId && String((match as any)._id) === overrideId && rx.allergyOverride?.reason;
          if (!hasOverride) {
            return res.status(409).json({
              error: 'AllergyConflict',
              message: `Patient has a known ${match.severity} allergy to '${match.allergen}' (reaction: ${match.reaction}). Provide allergyOverride with a reason to proceed.`,
              allergy: match,
            });
          }
          auditLog({ action: 'ALLERGY_OVERRIDE', resourceType: 'Patient', resourceId: String(req.body.patientId), userId: req.user!.userId, clinicId: req.user!.clinicId, metadata: { allergen: match.allergen, medication: rx.drugName, reason: rx.allergyOverride!.reason } }, req);
        }
      }
    }

    const doc = await EncounterModel.create(req.body);
    emitToClinic(req.user!.clinicId, 'encounter:created', { encounterId: String(doc._id), patientId: String(doc.patientId) });
    encountersCreatedTotal.inc({ clinicId: req.user!.clinicId });
    return res.status(201).json({ status: 'success', data: toEncounterResponse(doc) });
  })
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
  })
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

    const allowedFields = ['chiefComplaint', 'notes', 'soapNotes', 'aiSummary', 'diagnosis', 'treatmentPlan', 'vitalSigns', 'prescriptions', 'followUpDate', 'status'] as const;
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in req.body && req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.diagnosis) {
      const invalidCode = await validateDiagnosisCodes(updateData.diagnosis as any);
      if (invalidCode) {
        return res
          .status(400)
          .json({ error: 'BadRequest', message: `Invalid ICD-10 code: '${invalidCode}'` });
      }
    }

    const doc = await EncounterModel.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    emitToClinic(req.user!.clinicId, 'encounter:updated', { encounterId: req.params.id });
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
  })
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
      prescribedBy: req.user!.userId,
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
