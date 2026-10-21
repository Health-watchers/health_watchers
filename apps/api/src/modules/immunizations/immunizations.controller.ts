import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { auditLog } from '../audit/audit.service';
import { PatientModel } from '../patients/models/patient.model';
import { ImmunizationModel, CVX_CODES } from './immunization.model';
import { calculateDueVaccines, ageInMonths } from './immunization-schedule.service';
import { generateImmunizationCertificate } from './immunization-certificate.service';
import { detectVaccineConflicts } from './immunization-conflict.service';
import { recordDoseAdministered } from './vaccine-lot.service';
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

/**
 * @swagger
 * /patients/{id}/immunizations:
 *   post:
 *     summary: Record an immunization for a patient
 *     description: Restricted to clinical staff (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN). The recording clinician is taken from the authenticated caller. The action is recorded in the audit log.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vaccineName, vaccineCode, administeredDate, doseNumber]
 *             properties:
 *               vaccineName: { type: string, maxLength: 200, example: 'DTaP' }
 *               vaccineCode: { type: string, maxLength: 10, description: 'CVX code', example: '20' }
 *               manufacturer: { type: string, maxLength: 200 }
 *               lotNumber: { type: string, maxLength: 100 }
 *               administeredDate: { type: string, format: date-time }
 *               expiryDate: { type: string, format: date-time }
 *               doseNumber: { type: integer, minimum: 1, maximum: 20, example: 1 }
 *               seriesComplete: { type: boolean, default: false }
 *               site:
 *                 type: string
 *                 enum: [Left deltoid, Right deltoid, Left thigh, Right thigh, Left arm, Right arm, Oral, Nasal, Other]
 *               route:
 *                 type: string
 *                 enum: [Intramuscular, Subcutaneous, Intradermal, Oral, Intranasal, Intravenous]
 *               adverseReaction:
 *                 type: object
 *                 required: [description, severity, onsetDate]
 *                 properties:
 *                   description: { type: string, maxLength: 1000 }
 *                   severity: { type: string, enum: [mild, moderate, severe, life-threatening] }
 *                   onsetDate: { type: string, format: date-time }
 *                   resolvedDate: { type: string, format: date-time }
 *                   reportedToVAERS: { type: boolean, default: false }
 *               notes: { type: string, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Immunization recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: '507f1f77bcf86cd799439011' }
 *                     patientId: { type: string }
 *                     clinicId: { type: string }
 *                     vaccineName: { type: string }
 *                     vaccineCode: { type: string }
 *                     manufacturer: { type: string, nullable: true }
 *                     lotNumber: { type: string, nullable: true }
 *                     administeredDate: { type: string, format: date-time }
 *                     expiryDate: { type: string, format: date-time, nullable: true }
 *                     doseNumber: { type: integer }
 *                     seriesComplete: { type: boolean }
 *                     administeredBy: { type: string, description: 'User ObjectId of the administering clinician' }
 *                     site: { type: string, nullable: true }
 *                     route: { type: string, nullable: true }
 *                     adverseReaction: { type: object, nullable: true }
 *                     notes: { type: string, nullable: true }
 *                     isActive: { type: boolean, example: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR, NURSE, CLINIC_ADMIN, or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      vaccineName,
      vaccineCode,
      manufacturer,
      lotNumber,
      administeredDate,
      expiryDate,
      doseNumber,
      seriesComplete,
      site,
      route,
      adverseReaction,
      notes,
    } = req.body;

    // ── Conflict detection & lot checks (Issue #1246) ────────────────────────
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

    // Recalled or expired lots are a hard block; schedule conflicts are warnings.
    const blockingConflict = conflicts.find((c) =>
      ['recalled_lot', 'expired_lot'].includes(c.type)
    );
    if (blockingConflict) {
      return res.status(409).json({
        error: 'ConflictDetected',
        message: blockingConflict.message,
        data: { conflicts },
      });
    }

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

    // Decrement lot inventory when a tracked lot was used
    if (lotNumber) {
      await recordDoseAdministered(clinicId, lotNumber).catch(() => undefined);
    }

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
          conflictCount: conflicts.length,
        },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: immunization, conflicts });
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations:
 *   get:
 *     summary: List a patient's immunization records
 *     description: Returns active immunization records for the patient, scoped to the caller's clinic, newest administered date first.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: vaccineCode
 *         schema: { type: string }
 *         description: Filter by CVX code
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated list of immunization records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       patientId: { type: string }
 *                       vaccineName: { type: string }
 *                       vaccineCode: { type: string }
 *                       doseNumber: { type: integer }
 *                       seriesComplete: { type: boolean }
 *                       administeredDate: { type: string, format: date-time }
 *                       administeredBy: { type: string }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      { administeredDate: -1 }
    );

    await ImmunizationModel.populate(result.data, {
      path: 'administeredBy',
      select: 'firstName lastName',
    });

    return res.json({ status: 'success', data: result.data, meta: result.meta });
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/due:
 *   get:
 *     summary: Get due and overdue vaccines for a patient
 *     description: Compares the patient's age and administered vaccines against the CDC ACIP recommended immunization schedule. Requires the patient's date of birth to be on file.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Due/overdue vaccine schedule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     patientAgeMonths: { type: integer }
 *                     overdueCount: { type: integer }
 *                     dueCount: { type: integer }
 *                     vaccines:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vaccineName: { type: string }
 *                           vaccineCode: { type: string }
 *                           doseNumber: { type: integer }
 *                           seriesTotal: { type: integer }
 *                           category: { type: string, enum: [infant, child, adolescent, adult, travel, senior] }
 *                           description: { type: string }
 *                           status: { type: string, enum: [due, overdue] }
 *                           dueAtAgeMonths: { type: integer }
 *                           overdueAtAgeMonths: { type: integer }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Patient date of birth is required to calculate due vaccines
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      administered.map((i) => ({ vaccineCode: i.vaccineCode, doseNumber: i.doseNumber }))
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
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/certificate:
 *   get:
 *     summary: Download a PDF immunization certificate for a patient
 *     description: Streams a generated PDF certificate as an attachment. The download is recorded in the audit log.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *     responses:
 *       200:
 *         description: PDF certificate stream
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      req
    );
    return;
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/{immunizationId}:
 *   get:
 *     summary: Get a single immunization record
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *       - in: path
 *         name: immunizationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Immunization record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     patientId: { type: string }
 *                     clinicId: { type: string }
 *                     vaccineName: { type: string }
 *                     vaccineCode: { type: string }
 *                     manufacturer: { type: string, nullable: true }
 *                     lotNumber: { type: string, nullable: true }
 *                     administeredDate: { type: string, format: date-time }
 *                     expiryDate: { type: string, format: date-time, nullable: true }
 *                     doseNumber: { type: integer }
 *                     seriesComplete: { type: boolean }
 *                     administeredBy: { type: string }
 *                     site: { type: string, nullable: true }
 *                     route: { type: string, nullable: true }
 *                     adverseReaction: { type: object, nullable: true }
 *                     notes: { type: string, nullable: true }
 *                     isActive: { type: boolean }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Immunization record not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/{immunizationId}:
 *   put:
 *     summary: Update an immunization record
 *     description: Restricted to clinical staff (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN). All fields are optional; only supplied fields are updated. The update is recorded in the audit log.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *       - in: path
 *         name: immunizationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vaccineName: { type: string, maxLength: 200 }
 *               vaccineCode: { type: string, maxLength: 10 }
 *               manufacturer: { type: string, maxLength: 200 }
 *               lotNumber: { type: string, maxLength: 100 }
 *               administeredDate: { type: string, format: date-time }
 *               expiryDate: { type: string, format: date-time }
 *               doseNumber: { type: integer, minimum: 1, maximum: 20 }
 *               seriesComplete: { type: boolean }
 *               site:
 *                 type: string
 *                 enum: [Left deltoid, Right deltoid, Left thigh, Right thigh, Left arm, Right arm, Oral, Nasal, Other]
 *               route:
 *                 type: string
 *                 enum: [Intramuscular, Subcutaneous, Intradermal, Oral, Intranasal, Intravenous]
 *               adverseReaction:
 *                 type: object
 *                 properties:
 *                   description: { type: string, maxLength: 1000 }
 *                   severity: { type: string, enum: [mild, moderate, severe, life-threatening] }
 *                   onsetDate: { type: string, format: date-time }
 *                   resolvedDate: { type: string, format: date-time }
 *                   reportedToVAERS: { type: boolean }
 *               notes: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Immunization record updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     vaccineName: { type: string }
 *                     vaccineCode: { type: string }
 *                     doseNumber: { type: integer }
 *                     administeredDate: { type: string, format: date-time }
 *                     administeredBy: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR, NURSE, CLINIC_ADMIN, or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Immunization record not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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
      { new: true, runValidators: true }
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
      req
    );

    return res.json({ status: 'success', data: immunization });
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/{immunizationId}:
 *   delete:
 *     summary: Soft-delete an immunization record
 *     description: Restricted to clinical staff (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN). Sets isActive to false rather than removing the document. The deletion is recorded in the audit log.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *       - in: path
 *         name: immunizationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Immunization record deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     isActive: { type: boolean, example: false }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR, NURSE, CLINIC_ADMIN, or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Immunization record not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete(
  '/:immunizationId',
  CLINICAL_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { id: patientId, immunizationId } = req.params;
    const clinicId = req.user!.clinicId;

    const immunization = await ImmunizationModel.findOneAndUpdate(
      { _id: immunizationId, patientId, clinicId, isActive: true },
      { isActive: false },
      { new: true }
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
      req
    );

    return res.json({ status: 'success', data: { id: immunizationId, isActive: false } });
  })
);

/**
 * @swagger
 * /immunizations/cvx:
 *   get:
 *     summary: List the CVX vaccine code lookup table
 *     description: Returns the platform's subset of CDC CVX (vaccine administered) codes used when recording immunizations.
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of CVX code/name pairs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code: { type: string, example: '20' }
 *                       name: { type: string, example: 'DTaP' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export const cvxCodesRouter = Router();
cvxCodesRouter.use(authenticate);
cvxCodesRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const codes = Object.entries(CVX_CODES).map(([code, name]) => ({ code, name }));
    return res.json({ status: 'success', data: codes });
  })
);

/**
 * @swagger
 * /patients/{id}/immunizations/overdue:
 *   get:
 *     summary: List overdue immunizations across the clinic
 *     description: >
 *       Restricted to CLINIC_ADMIN and DOCTOR. Scans every active patient in the caller's clinic against the
 *       compliance schedule and returns overdue doses, sorted by days overdue (descending). The `:id` path
 *       segment is not used by this handler (route is defined on the same router as the patient-scoped
 *       immunization endpoints).
 *     tags: [Immunizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Overdue immunizations for the clinic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       patientId: { type: string }
 *                       patientName: { type: string }
 *                       vaccineName: { type: string }
 *                       vaccineCode: { type: string }
 *                       dueDate: { type: string, format: date-time }
 *                       daysOverdue: { type: integer }
 *                       attendingDoctorId: { type: string }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit: { type: integer }
 *                     offset: { type: integer }
 *                     total: { type: integer }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks CLINIC_ADMIN or DOCTOR role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/overdue',
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { immunizationComplianceService } = await import('./immunization-compliance.service');

    // Get all patients in clinic
    const patients = await PatientModel.find({ clinicId, isActive: true })
      .select('_id firstName lastName dateOfBirth attendingDoctorId')
      .lean();

    const allOverdue = [];
    for (const patient of patients) {
      const overdue = await immunizationComplianceService.findOverdueForPatient(
        patient._id.toString()
      );
      allOverdue.push(...overdue);
    }

    // Sort by days overdue (descending)
    allOverdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Paginate
    const paginatedOverdue = allOverdue.slice(offset, offset + limit);

    return res.json({
      status: 'success',
      data: paginatedOverdue,
      pagination: { limit, offset, total: allOverdue.length },
    });
  })
);

export const immunizationRoutes = router;
