import { Router, Request, Response } from 'express';
import { toEncounterResponse } from './encounters.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { clinicScope } from '@api/middlewares/clinic-scope.middleware';
import { checkSubscriptionLimit } from '@api/middlewares/subscription.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createEncounterSchema,
  patchEncounterSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
  listEncountersQuerySchema,
  ListEncountersQuery,
  recordOutcomeSchema,
  RecordOutcomeDto,
  followUpQueueQuerySchema,
  FollowUpQueueQuery,
} from './encounter.validation';
import { auditLog } from '../audit/audit.service';
import { EncounterService } from './encounter.service';

const encounterService = new EncounterService();

const router = Router();
router.use(authenticate);
router.use(clinicScope);

// GET /encounters — paginated list scoped to the authenticated clinic
// Supports: q (full-text), patientId, doctorId, status, date, dateFrom, dateTo,
//           diagnosisCode, hasAiSummary, hasPrescriptions, sort, page, limit
//
// Full-text search (`q`):
//   - Uses the MongoDB text index on the Encounter model (`soapNotes`,
//     `diagnosis`, `chiefComplaint`).
//   - Results are always scoped to the authenticated clinic and active records.
//   - Results are sorted by relevance (`textScore`) descending; each result
//     includes a `score` field. Other filters (patientId, status, dates, etc.)
//     are applied alongside the text query.
//   - Multi-word queries are treated as OR by default (MongoDB text search);
//     wrap a phrase in double quotes for an exact-phrase match.
//   - Partial/prefix matches are NOT supported by MongoDB text indexes — only
//     whole stemmed words match (e.g. "head" will not match "headache").
//   - When no documents match, an empty `data` array is returned with
//     `meta.total === 0`.
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

    const { data, total } = await encounterService.listEncounters(req.clinicId, {
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
    });

    return res.json({
      status: 'success',
      data: data.map((doc: any) => ({
        ...toEncounterResponse(doc),
        score: doc.score,
        patient: doc.patientInfo
          ? {
              firstName: doc.patientInfo.firstName,
              lastName: doc.patientInfo.lastName,
              systemId: doc.patientInfo.systemId,
            }
          : doc.patient,
      })),
      meta: { total, page, limit },
    });
  })
);

// POST /encounters
// Optional query param: ?templateId=<id> — pre-fills fields from template, doctor values take precedence
router.post(
  '/',
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'NURSE'),
  checkSubscriptionLimit('encounters'),
  validateRequest({ body: createEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.query;

    const result = await encounterService.createEncounter(
      req.clinicId,
      req.user!.userId,
      req.body,
      typeof templateId === 'string' ? templateId : undefined,
      req
    );

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    return res.status(201).json({
      status: 'success',
      data: toEncounterResponse(result.encounter),
      cdsAlerts: result.cdsAlerts.length > 0 ? result.cdsAlerts : undefined,
      ageAlerts: result.ageAlerts.length > 0 ? result.ageAlerts : undefined,
    });
  })
);

// GET /encounters/follow-ups-due — must be before /:id to avoid param capture
router.get(
  '/follow-ups-due',
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN'),
  validateRequest({ query: followUpQueueQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as FollowUpQueueQuery;
    const result = await encounterService.listFollowUpsDue(req.clinicId, q);
    return res.status(200).json({
      status: 'success',
      data: result.data.map((d) => toEncounterResponse(d as any)),
      meta: result.meta,
    });
  })
);

// GET /encounters/:id
router.get(
  '/:id',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await encounterService.getEncounter(req.clinicId, req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    auditLog(
      {
        action: 'ENCOUNTER_VIEW',
        resourceType: 'Encounter',
        resourceId: String(doc._id),
        userId: req.user!.userId,
        clinicId: req.clinicId,
      },
      req
    );
    return res.json({ status: 'success', data: toEncounterResponse(doc) });
  })
);

// PUT /encounters/:id/outcome — record clinical outcome
router.put(
  '/:id/outcome',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ body: recordOutcomeSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RecordOutcomeDto;
    const result = await encounterService.recordOutcome(req.clinicId, req.params.id, body);
    if (!result.ok) {
      return res.status(result.status).json({ status: 'error', message: result.message });
    }
    return res.status(200).json({ status: 'success', data: toEncounterResponse(result.encounter) });
  })
);

// PATCH /encounters/:id — only DOCTOR (own) or CLINIC_ADMIN; closed encounters → 409
router.patch(
  '/:id',
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  validateRequest({ params: encounterIdParamSchema, body: patchEncounterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await encounterService.updateEncounter(
      req.clinicId,
      req.user!.userId,
      req.user!.role,
      req.params.id,
      req.body
    );

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    return res.json({ status: 'success', data: toEncounterResponse(result.encounter) });
  })
);

// DELETE /encounters/:id — soft-delete via status:'cancelled'; CLINIC_ADMIN or SUPER_ADMIN only
router.delete(
  '/:id',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await encounterService.softDeleteEncounter(req.clinicId, req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    return res.json({
      status: 'success',
      message: 'Encounter cancelled',
      data: toEncounterResponse(doc),
    });
  })
);

// GET /encounters/patient/:patientId
router.get(
  '/patient/:patientId',
  validateRequest({ params: patientIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await encounterService.listByPatient(req.clinicId, req.params.patientId);
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

    const rx = req.body as {
      drugName: string;
      allergyOverride?: { allergyId: string; reason: string };
    };

    // ── Allergy cross-reference check ─────────────────────────────────────────
    const allergyWarnings: Array<{ allergen: string; severity: string; reaction: string }> = [];
    const patient = await PatientModel.findOne({
      _id: encounter.patientId,
      clinicId: req.user!.clinicId,
    })
      .select('allergies')
      .lean();
    const activeAllergies = (patient?.allergies ?? []).filter(
      (a: any) => a.isActive && a.allergenType === 'drug'
    );

    const allergyMatch = activeAllergies.find(
      (a: any) =>
        rx.drugName.toLowerCase().includes(a.allergen.toLowerCase()) ||
        a.allergen.toLowerCase().includes(rx.drugName.toLowerCase())
    );

    if (allergyMatch) {
      const overrideId = rx.allergyOverride?.allergyId;
      const hasOverride =
        overrideId &&
        String((allergyMatch as any)._id) === overrideId &&
        rx.allergyOverride?.reason;

      if (!hasOverride) {
        return res.status(409).json({
          error: 'AllergyConflict',
          message: `Patient has a known ${allergyMatch.severity} allergy to '${allergyMatch.allergen}' (reaction: ${allergyMatch.reaction}). Provide allergyOverride with a reason to proceed.`,
          allergy: allergyMatch,
        });
      }

      // Override provided — audit and warn
      allergyWarnings.push({
        allergen: allergyMatch.allergen,
        severity: allergyMatch.severity,
        reaction: allergyMatch.reaction,
      });

      auditLog(
        {
          action: 'ALLERGY_OVERRIDE',
          resourceType: 'Patient',
          resourceId: String(encounter.patientId),
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          metadata: {
            allergen: allergyMatch.allergen,
            medication: rx.drugName,
            reason: rx.allergyOverride!.reason,
            encounterId: req.params.id,
          },
        },
        req
      );

      // Emit Socket.IO warning to the clinic (doctor's room)
      emitToClinic(req.user!.clinicId, 'prescription:allergy_warning', {
        encounterId: req.params.id,
        patientId: String(encounter.patientId),
        drugName: rx.drugName,
        allergen: allergyMatch.allergen,
        severity: allergyMatch.severity,
        reaction: allergyMatch.reaction,
        overrideReason: rx.allergyOverride!.reason,
      });
    }

    const prescription: Prescription = {
      ...req.body,
      prescribedBy: req.user!.userId,
      prescribedAt: new Date(),
    };

    // Evaluate CDS rules for prescription addition
    const patientContext = await cdsRulesEngine.getPatientContext(
      encounter.patientId as any,
      req.user!.clinicId as any
    );
    const cdsAlerts = await cdsRulesEngine.evaluateRules('prescription_add', {
      patientId: encounter.patientId as any,
      clinicId: req.user!.clinicId as any,
      prescription,
      ...patientContext,
    });

    // Block if critical alert
    const criticalAlert = cdsAlerts.find((a) => a.severity === 'critical' && a.action === 'block');
    if (criticalAlert) {
      return res.status(409).json({
        error: 'CDSBlockingAlert',
        message: criticalAlert.message,
        alert: criticalAlert,
      });
    }

    encounter.prescriptions = encounter.prescriptions || [];
    encounter.prescriptions.push(prescription);
    await encounter.save();

    return res.status(201).json({
      status: 'success',
      data: toEncounterResponse(encounter),
      cdsAlerts: cdsAlerts.length > 0 ? cdsAlerts : undefined,
      allergyWarnings: allergyWarnings.length > 0 ? allergyWarnings : undefined,
      message: 'Prescription added successfully',
    });
  })
);

// GET /encounters/:id/prescriptions - List prescriptions for encounter
router.get(
  '/:id/prescriptions',
  validateRequest({ params: encounterIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const encounter = await EncounterModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    }).populate('prescriptions.prescribedBy', 'firstName lastName');

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    return res.json({
      status: 'success',
      data: encounter.prescriptions || [],
    });
  })
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
      data: toEncounterResponse(encounter),
    });
  })
);

// Mount attachment routes
import { attachmentRoutes } from './attachments.controller';
router.use('/:encounterId/attachments', attachmentRoutes);

// ── Co-signature routes ───────────────────────────────────────────────────────
import { CoSignatureController } from './cosignature.controller';

router.get('/pending-cosignatures', asyncHandler(CoSignatureController.getPendingQueue));
router.post('/:id/request-cosign', asyncHandler(CoSignatureController.requestCoSignature));
router.post('/:id/cosign', asyncHandler(CoSignatureController.approveCoSignature));
router.post('/:id/reject-cosign', asyncHandler(CoSignatureController.rejectCoSignature));

export const encounterRoutes = router;
