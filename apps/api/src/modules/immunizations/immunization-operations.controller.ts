import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { auditLog } from '../audit/audit.service';
import { PatientModel } from '../patients/models/patient.model';
import { ImmunizationModel } from './immunization.model';
import { detectVaccineConflicts } from './immunization-conflict.service';
import { calculateImmunityStatus } from './immunity-status.service';
import { getImmunizationAnalytics } from './immunization-analytics.service';
import {
  createLot,
  receiveLotStock,
  adjustLotStock,
  listLots,
  getLot,
} from './vaccine-lot.service';
import {
  reportAdverseEvent,
  listAdverseEvents,
  getAdverseEvent,
  updateAdverseEvent,
} from './adverse-event.service';
import {
  createRecall,
  listRecalls,
  getAffectedPatients,
  resolveRecall,
  markPatientsNotified,
} from './immunization-recall.service';
import {
  conflictCheckSchema,
  immunityStatusQuerySchema,
  analyticsQuerySchema,
  createLotSchema,
  listLotsQuerySchema,
  receiveLotSchema,
  adjustLotSchema,
  recallLotSchema,
  reportAdverseEventSchema,
  updateAdverseEventSchema,
  listAdverseEventsQuerySchema,
  createRecallSchema,
  listRecallsQuerySchema,
  idParamSchema,
} from './immunization-operations.validation';

const router = Router();
router.use(authenticate);

/** Roles allowed to record/change immunization operations. */
const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');

async function findPatient(patientId: string, clinicId: string) {
  return PatientModel.findOne({ _id: patientId, clinicId, isActive: true });
}

// ── Conflict detection ───────────────────────────────────────────────────────
// POST /immunizations/conflicts/check
router.post(
  '/conflicts/check',
  CLINICAL_ROLES,
  validateRequest({ body: conflictCheckSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, vaccineCode, doseNumber, administeredDate, lotNumber } = req.body;
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }
    if (!patient.dateOfBirth) {
      return res.status(422).json({
        error: 'UnprocessableEntity',
        message: 'Patient date of birth is required for conflict detection',
      });
    }

    const previousDoses = await ImmunizationModel.find({
      patientId,
      clinicId,
      isActive: true,
      vaccineCode,
    })
      .select('vaccineCode doseNumber administeredDate')
      .lean();

    const conflicts = await detectVaccineConflicts({
      clinicId,
      dateOfBirth: String(patient.dateOfBirth),
      vaccineCode,
      doseNumber,
      administeredDate: new Date(administeredDate),
      previousDoses: previousDoses.map((d) => ({
        vaccineCode: d.vaccineCode,
        doseNumber: d.doseNumber,
        administeredDate: d.administeredDate as Date,
      })),
      lotNumber,
    });

    const hasCritical = conflicts.some((c) => c.severity === 'critical');

    return res.status(200).json({
      status: 'success',
      data: { conflicts, hasCritical },
    });
  })
);

// ── Immunity status ──────────────────────────────────────────────────────────
// GET /immunizations/immunity-status?patientId=
router.get(
  '/immunity-status',
  validateRequest({ query: immunityStatusQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.query as { patientId: string };
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }
    if (!patient.dateOfBirth) {
      return res.status(422).json({
        error: 'UnprocessableEntity',
        message: 'Patient date of birth is required for immunity status',
      });
    }

    const doses = await ImmunizationModel.find({ patientId, clinicId, isActive: true })
      .select('vaccineCode doseNumber administeredDate')
      .lean();

    const statuses = calculateImmunityStatus(
      String(patient.dateOfBirth),
      doses.map((d) => ({
        vaccineCode: d.vaccineCode,
        doseNumber: d.doseNumber,
        administeredDate: d.administeredDate as Date,
      }))
    );

    const summary = statuses.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    }, {});

    return res.json({ status: 'success', data: { summary, vaccines: statuses } });
  })
);

// ── Analytics ────────────────────────────────────────────────────────────────
// GET /immunizations/analytics
router.get(
  '/analytics',
  ADMIN_ROLES,
  validateRequest({ query: analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    const data = await getImmunizationAnalytics(clinicId, from, to);

    await auditLog(
      {
        action: 'IMMUNIZATION_ANALYTICS',
        resourceType: 'Clinic',
        resourceId: clinicId,
        userId: req.user!.userId,
        clinicId,
        metadata: { from: from.toISOString(), to: to.toISOString() },
      },
      req
    );

    return res.json({ status: 'success', data });
  })
);

// ── Vaccine lots (lot tracking + supply chain) ───────────────────────────────
// POST /immunizations/lots
router.post(
  '/lots',
  CLINICAL_ROLES,
  validateRequest({ body: createLotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      lotNumber,
      vaccineCode,
      vaccineName,
      manufacturer,
      supplier,
      expiryDate,
      quantityReceived,
      reorderThreshold,
      notes,
    } = req.body;

    const lot = await createLot({
      clinicId: req.user!.clinicId,
      lotNumber,
      vaccineCode,
      vaccineName,
      manufacturer,
      supplier,
      expiryDate: new Date(expiryDate),
      quantityReceived,
      reorderThreshold,
      notes,
    });

    return res.status(201).json({ status: 'success', data: lot });
  })
);

// GET /immunizations/lots
router.get(
  '/lots',
  validateRequest({ query: listLotsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { vaccineCode, status, limit } = req.query as {
      vaccineCode?: string;
      status?: string;
      limit?: number;
    };

    const data = await listLots(req.user!.clinicId, { vaccineCode, status, limit });
    return res.json({ status: 'success', data });
  })
);

// GET /immunizations/lots/:id
router.get(
  '/lots/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const lot = await getLot(req.params.id, req.user!.clinicId);
    return res.json({ status: 'success', data: lot });
  })
);

// POST /immunizations/lots/:id/receive — supply chain intake
router.post(
  '/lots/:id/receive',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema, body: receiveLotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const lot = await receiveLotStock(req.params.id, req.user!.clinicId, req.body.quantity);
    return res.json({ status: 'success', data: lot });
  })
);

// POST /immunizations/lots/:id/adjust — record administered/wasted doses
router.post(
  '/lots/:id/adjust',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema, body: adjustLotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const lot = await adjustLotStock(req.params.id, req.user!.clinicId, req.body);
    return res.json({ status: 'success', data: lot });
  })
);

// POST /immunizations/lots/:id/recall — recall a lot
router.post(
  '/lots/:id/recall',
  ADMIN_ROLES,
  validateRequest({ params: idParamSchema, body: recallLotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recall = await createRecall({
      clinicId: req.user!.clinicId,
      lotId: req.params.id,
      reason: req.body.reason,
      severity: 'high',
      initiatedBy: req.user!.userId,
    });

    await auditLog(
      {
        action: 'IMMUNIZATION_LOT_RECALL',
        resourceType: 'VaccineLot',
        resourceId: req.params.id,
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        metadata: { lotNumber: recall.lotNumber, reason: req.body.reason },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: recall });
  })
);

// ── Adverse events ───────────────────────────────────────────────────────────
// POST /immunizations/adverse-events
router.post(
  '/adverse-events',
  CLINICAL_ROLES,
  validateRequest({ body: reportAdverseEventSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      patientId,
      immunizationId,
      vaccineCode,
      vaccineName,
      lotNumber,
      description,
      severity,
      onsetDate,
      resolvedDate,
      outcome,
      reportedToVAERS,
      vaersReportId,
      notes,
    } = req.body;

    const event = await reportAdverseEvent({
      clinicId: req.user!.clinicId,
      patientId,
      immunizationId,
      vaccineCode,
      vaccineName,
      lotNumber,
      description,
      severity,
      onsetDate: new Date(onsetDate),
      resolvedDate: resolvedDate ? new Date(resolvedDate) : undefined,
      outcome,
      reportedToVAERS,
      vaersReportId,
      reportedBy: req.user!.userId,
      notes,
    });

    return res.status(201).json({ status: 'success', data: event });
  })
);

// GET /immunizations/adverse-events
router.get(
  '/adverse-events',
  validateRequest({ query: listAdverseEventsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, vaccineCode, severity, from, to, limit } = req.query as {
      patientId?: string;
      vaccineCode?: string;
      severity?: string;
      from?: string;
      to?: string;
      limit?: number;
    };

    const data = await listAdverseEvents(req.user!.clinicId, {
      patientId,
      vaccineCode,
      severity,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
    });

    return res.json({ status: 'success', data });
  })
);

// GET /immunizations/adverse-events/:id
router.get(
  '/adverse-events/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const event = await getAdverseEvent(req.params.id, req.user!.clinicId);
    return res.json({ status: 'success', data: event });
  })
);

// PATCH /immunizations/adverse-events/:id
router.patch(
  '/adverse-events/:id',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema, body: updateAdverseEventSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const update: Record<string, unknown> = { ...req.body };
    if (update.resolvedDate) update.resolvedDate = new Date(String(update.resolvedDate));

    const event = await updateAdverseEvent(
      req.params.id,
      req.user!.clinicId,
      update as Parameters<typeof updateAdverseEvent>[2]
    );
    return res.json({ status: 'success', data: event });
  })
);

// ── Recalls ──────────────────────────────────────────────────────────────────
// POST /immunizations/recalls
router.post(
  '/recalls',
  ADMIN_ROLES,
  validateRequest({ body: createRecallSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { lotId, reason, severity, patientsNotified } = req.body;

    const recall = await createRecall({
      clinicId: req.user!.clinicId,
      lotId,
      reason,
      severity,
      initiatedBy: req.user!.userId,
      patientsNotified,
    });

    await auditLog(
      {
        action: 'IMMUNIZATION_RECALL',
        resourceType: 'ImmunizationRecall',
        resourceId: String(recall._id),
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        metadata: { lotNumber: recall.lotNumber, reason, severity },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: recall });
  })
);

// GET /immunizations/recalls
router.get(
  '/recalls',
  validateRequest({ query: listRecallsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, lotNumber, limit } = req.query as {
      status?: string;
      lotNumber?: string;
      limit?: number;
    };

    const data = await listRecalls(req.user!.clinicId, { status, lotNumber, limit });
    return res.json({ status: 'success', data });
  })
);

// GET /immunizations/recalls/:id/affected-patients
router.get(
  '/recalls/:id/affected-patients',
  ADMIN_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getAffectedPatients(req.params.id, req.user!.clinicId);
    return res.json({ status: 'success', data });
  })
);

// PATCH /immunizations/recalls/:id/notified
router.patch(
  '/recalls/:id/notified',
  ADMIN_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recall = await markPatientsNotified(req.params.id, req.user!.clinicId);
    return res.json({ status: 'success', data: recall });
  })
);

// PATCH /immunizations/recalls/:id/resolve
router.patch(
  '/recalls/:id/resolve',
  ADMIN_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const recall = await resolveRecall(req.params.id, req.user!.clinicId, req.user!.userId);
    return res.json({ status: 'success', data: recall });
  })
);

export const immunizationOpsRoutes = router;
