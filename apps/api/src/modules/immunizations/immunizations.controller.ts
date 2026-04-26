import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { auditLog } from '../audit/audit.service';
import { PatientModel } from '../patients/models/patient.model';
import { ImmunizationModel, CVX_CODES } from './immunization.model';
import { calculateDueVaccines, ageInMonths } from './immunization-schedule.service';
import { generateImmunizationCertificate } from './immunization-certificate.service';
import {
  createImmunizationSchema,
  updateImmunizationSchema,
  listImmunizationsQuerySchema,
} from './immunization.validation';
import { paginate } from '@api/utils/paginate';

const router = Router({ mergeParams: true });
router.use(authenticate);

/** Only DOCTOR or NURSE (and admins) can record immunizations */
const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');

async function findPatient(patientId: string, clinicId: string) {
  return PatientModel.findOne({ _id: patientId, clinicId, isActive: true });
}

// POST /api/v1/patients/:id/immunizations — Record immunization
router.post(
  '/',
  CLINICAL_ROLES,
  validateRequest({ body: createImmunizationSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.params.id;
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    const {
      vaccineName, vaccineCode, manufacturer, lotNumber,
      administeredDate, expiryDate, doseNumber, seriesComplete,
      site, route, adverseReaction, notes,
    } = req.body;

    const immunization = await ImmunizationModel.create({
      patientId,
      clinicId,
      vaccineName,
      vaccineCode,
      manufacturer,
      lotNumber,
      administeredDate: new Date(administeredDate),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      doseNumber,
      seriesComplete: seriesComplete ?? false,
      administeredBy: req.user!.userId,
      site,
      route,
      adverseReaction: adverseReaction
        ? {
            ...adverseReaction,
            onsetDate: new Date(adverseReaction.onsetDate),
            resolvedDate: adverseReaction.resolvedDate
              ? new Date(adverseReaction.resolvedDate)
              : undefined,
          }
        : undefined,
      notes,
      isActive: true,
    });

    await auditLog(
      {
        action: 'IMMUNIZATION_CREATE',
        resourceType: 'Immunization',
        resourceId: String(immunization._id),
        userId: req.user!.userId,
        clinicId,
        metadata: {
          patientId,
          vaccineName,
          vaccineCode,
          doseNumber,
          hasAdverseReaction: !!adverseReaction,
        },
      },
      req,
    );

    return res.status(201).json({ status: 'success', data: immunization });
  }),
);

// GET /api/v1/patients/:id/immunizations — List immunizations
router.get(
  '/',
  validateRequest({ query: listImmunizationsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.params.id;
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    const { page, limit, vaccineCode, from, to } = req.query as Record<string, any>;

    const filter: Record<string, any> = { patientId, clinicId, isActive: true };
    if (vaccineCode) filter.vaccineCode = vaccineCode;
    if (from || to) {
      filter.administeredDate = {};
      if (from) filter.administeredDate.$gte = new Date(from);
      if (to) filter.administeredDate.$lte = new Date(to);
    }

    const result = await paginate(
      ImmunizationModel,
      filter,
      Number(page) || 1,
      Number(limit) || 20,
      { administeredDate: -1 },
    );

    await ImmunizationModel.populate(result.data, {
      path: 'administeredBy',
      select: 'firstName lastName',
    });

    return res.json({ status: 'success', data: result.data, meta: result.meta });
  }),
);

// GET /api/v1/patients/:id/immunizations/due — Get due vaccines
router.get(
  '/due',
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.params.id;
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    if (!patient.dateOfBirth) {
      return res.status(422).json({
        error: 'UnprocessableEntity',
        message: 'Patient date of birth is required to calculate due vaccines',
      });
    }

    const administered = await ImmunizationModel.find({ patientId, clinicId, isActive: true })
      .select('vaccineCode doseNumber')
      .lean();

    const dueVaccines = calculateDueVaccines(
      String(patient.dateOfBirth),
      administered.map((i) => ({ vaccineCode: i.vaccineCode, doseNumber: i.doseNumber })),
    );

    const overdueCount = dueVaccines.filter((v) => v.status === 'overdue').length;
    const dueCount = dueVaccines.filter((v) => v.status === 'due').length;

    return res.json({
      status: 'success',
      data: {
        patientAgeMonths: ageInMonths(String(patient.dateOfBirth)),
        overdueCount,
        dueCount,
        vaccines: dueVaccines,
      },
    });
  }),
);

// GET /api/v1/patients/:id/immunizations/certificate — Download PDF certificate
router.get(
  '/certificate',
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = req.params.id;
    const clinicId = req.user!.clinicId;

    const patient = await findPatient(patientId, clinicId);
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    const stream = await generateImmunizationCertificate({ patientId, clinicId });
    const filename = `immunization-certificate-${patient.systemId}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);

    await auditLog(
      {
        action: 'IMMUNIZATION_CERTIFICATE',
        resourceType: 'Patient',
        resourceId: patientId,
        userId: req.user!.userId,
        clinicId,
        metadata: { patientId, filename },
      },
      req,
    );
  }),
);

// GET /api/v1/patients/:id/immunizations/:immunizationId — Get single record
router.get(
  '/:immunizationId',
  asyncHandler(async (req: Request, res: Response) => {
    const { id: patientId, immunizationId } = req.params;
    const clinicId = req.user!.clinicId;

    const immunization = await ImmunizationModel.findOne({
      _id: immunizationId,
      patientId,
      clinicId,
      isActive: true,
    }).populate('administeredBy', 'firstName lastName');

    if (!immunization) {
      return res.status(404).json({ error: 'NotFound', message: 'Immunization record not found' });
    }

    return res.json({ status: 'success', data: immunization });
  }),
);

// PUT /api/v1/patients/:id/immunizations/:immunizationId — Update record
router.put(
  '/:immunizationId',
  CLINICAL_ROLES,
  validateRequest({ body: updateImmunizationSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: patientId, immunizationId } = req.params;
    const clinicId = req.user!.clinicId;

    const update: Record<string, any> = { ...req.body };
    if (update.administeredDate) update.administeredDate = new Date(update.administeredDate);
    if (update.expiryDate) update.expiryDate = new Date(update.expiryDate);
    if (update.adverseReaction?.onsetDate) {
      update.adverseReaction.onsetDate = new Date(update.adverseReaction.onsetDate);
    }
    if (update.adverseReaction?.resolvedDate) {
      update.adverseReaction.resolvedDate = new Date(update.adverseReaction.resolvedDate);
    }

    const immunization = await ImmunizationModel.findOneAndUpdate(
      { _id: immunizationId, patientId, clinicId, isActive: true },
      update,
      { new: true, runValidators: true },
    ).populate('administeredBy', 'firstName lastName');

    if (!immunization) {
      return res.status(404).json({ error: 'NotFound', message: 'Immunization record not found' });
    }

    await auditLog(
      {
        action: 'IMMUNIZATION_UPDATE',
        resourceType: 'Immunization',
        resourceId: immunizationId,
        userId: req.user!.userId,
        clinicId,
        metadata: { patientId, updatedFields: Object.keys(req.body) },
      },
      req,
    );

    return res.json({ status: 'success', data: immunization });
  }),
);

// DELETE /api/v1/patients/:id/immunizations/:immunizationId — Soft delete
router.delete(
  '/:immunizationId',
  CLINICAL_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { id: patientId, immunizationId } = req.params;
    const clinicId = req.user!.clinicId;

    const immunization = await ImmunizationModel.findOneAndUpdate(
      { _id: immunizationId, patientId, clinicId, isActive: true },
      { isActive: false },
      { new: true },
    );

    if (!immunization) {
      return res.status(404).json({ error: 'NotFound', message: 'Immunization record not found' });
    }

    await auditLog(
      {
        action: 'IMMUNIZATION_DELETE',
        resourceType: 'Immunization',
        resourceId: immunizationId,
        userId: req.user!.userId,
        clinicId,
        metadata: { patientId },
      },
      req,
    );

    return res.json({ status: 'success', data: { id: immunizationId, isActive: false } });
  }),
);

// GET /api/v1/immunizations/cvx-codes — CVX code lookup table
export const cvxCodesRouter = Router();
cvxCodesRouter.use(authenticate);
cvxCodesRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const codes = Object.entries(CVX_CODES).map(([code, name]) => ({ code, name }));
    return res.json({ status: 'success', data: codes });
  }),
);

export const immunizationRoutes = router;
