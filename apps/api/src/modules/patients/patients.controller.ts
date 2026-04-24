import { Router, Request, Response } from 'express';
import { PatientModel } from './models/patient.model';
import { PatientCounterModel } from './models/patient-counter.model';
import { toPatientResponse } from './patients.transformer';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginate, parsePagination } from '../../utils/paginate';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { toPaymentResponse } from '../payments/payments.transformer';
import { EncounterModel } from '../encounters/encounter.model';
import { toEncounterResponse } from '../encounters/encounters.transformer';
import { LabResultModel } from '../lab-results/lab-result.model';
import {
  createPatientSchema,
  updatePatientSchema,
  patientQuerySchema,
  patientSearchQuerySchema,
} from './patients.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const ADMIN_ROLES = requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN');

const ALLOWED_PATCH_FIELDS = new Set([
  'firstName',
  'lastName',
  'dateOfBirth',
  'sex',
  'contactNumber',
  'address',
]);

/** Calculate trend from last N readings: 'improving' | 'stable' | 'worsening' */
function calcTrend(values: number[]): 'improving' | 'stable' | 'worsening' {
  if (values.length < 2) return 'stable';
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const threshold = first * 0.03; // 3% change threshold
  if (Math.abs(delta) < threshold) return 'stable';
  return delta < 0 ? 'improving' : 'worsening';
}

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: clinicId },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  const short = clinicId.slice(-6).toUpperCase();
  const padded = String(counter!.value).padStart(6, '0');
  return `HW-${short}-${padded}`;
}

// GET /patients?page=1&limit=20&clinicId=
router.get(
  '/',
  validateRequest({ query: patientQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter: Record<string, any> = { isActive: true };
    if (req.query.clinicId) filter.clinicId = req.query.clinicId;

    const result = await paginate(PatientModel, filter, page, limit);
    return res.json({ status: 'success', data: result.data.map(toPatientResponse), meta: result.meta });
  }),
);

// GET /patients/search?q=
router.get(
  '/search',
  validateRequest({ query: patientSearchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const q = String(req.query.q || '').trim();
    const filter: Record<string, any> = { isActive: true };
    if (q) filter.searchName = { $regex: q, $options: 'i' };

    const result = await paginate(PatientModel, filter, page, limit);
    return res.json({ status: 'success', data: result.data.map(toPatientResponse), meta: result.meta });
  }),
);

// GET /patients/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// POST /patients
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createPatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { firstName, lastName, dateOfBirth, sex, contactNumber, address, clinicId } = req.body;
    const searchName = `${firstName} ${lastName}`.toLowerCase();
    const systemId = await nextSystemId(clinicId || req.user!.clinicId);
    const doc = await PatientModel.create({
      systemId,
      firstName,
      lastName,
      dateOfBirth: new Date(dateOfBirth),
      sex,
      contactNumber,
      address,
      clinicId: clinicId || req.user!.clinicId,
      isActive: true,
      searchName,
    });
    return res.status(201).json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// PUT /patients/:id
router.put(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: createPatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
    const update: Record<string, any> = { contactNumber, address, sex };
    if (firstName) update.firstName = firstName;
    if (lastName) update.lastName = lastName;
    if (firstName || lastName) {
      update.searchName = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
    }
    if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);

    const doc = await PatientModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(doc) });
  }),
);

// PATCH /patients/:id — partial update of allowed fields only
router.patch(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: updatePatientSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const disallowed = Object.keys(req.body).filter((k) => !ALLOWED_PATCH_FIELDS.has(k));
    if (disallowed.length > 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Field(s) not updatable: ${disallowed.join(', ')}`,
      });
    }

    const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = req.body;
    const update: Record<string, any> = {};
    if (sex !== undefined) update.sex = sex;
    if (contactNumber !== undefined) update.contactNumber = contactNumber;
    if (address !== undefined) update.address = address;
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (dateOfBirth !== undefined) update.dateOfBirth = new Date(dateOfBirth);

    if (firstName !== undefined || lastName !== undefined) {
      const doc = await PatientModel.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      update.searchName = `${firstName ?? doc.firstName} ${lastName ?? doc.lastName}`
        .toLowerCase()
        .trim();
    }

    const updated = await PatientModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      update,
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(updated) });
  }),
);

// DELETE /patients/:id — soft delete
router.delete(
  '/:id',
  ADMIN_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await PatientModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
  }),
);

// GET /patients/:id/payments
router.get(
  '/:id/payments',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;

    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const result = await paginate(
      PaymentRecordModel,
      { patientId: req.params.id, clinicId: req.user!.clinicId },
      page,
      limit,
    );
    return res.json({ status: 'success', data: result.data.map(toPaymentResponse), meta: result.meta });
  }),
);

// GET /patients/:id/encounters
router.get(
  '/:id/encounters',
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;

    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const result = await paginate(
      EncounterModel,
      { patientId: req.params.id, clinicId: req.user!.clinicId, isActive: true },
      page,
      limit,
      { createdAt: -1 },
    );
    return res.json({ status: 'success', data: result.data.map(toEncounterResponse), meta: result.meta });
  }),
);

// GET /patients/:id/prescriptions - All prescriptions for a patient (across encounters)
router.get(
  '/:id/prescriptions',
// GET /patients/:id/export/pdf - Export patient medical record as PDF
router.get(
  '/:id/export/pdf',
  WRITE_ROLES,
// GET /patients/:id/vitals — all vital sign readings across encounters
// Query params: ?type=bloodPressure&from=2024-01-01&to=2024-12-31
router.get(
  '/:id/vitals',
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    // Import PDF generator and export log model
    const { generatePatientPDF } = await import('../export/pdf-generator.service');
    const { ExportLogModel } = await import('../export/export-log.model');
    const logger = await import('../../utils/logger').then(m => m.default);

    try {
      // Generate PDF stream
      const pdfStream = await generatePatientPDF({
        patientId: req.params.id,
        clinicId: req.user!.clinicId,
      });

      // Log the export
      await ExportLogModel.create({
        patientId: req.params.id,
        clinicId: req.user!.clinicId,
        exportedBy: req.user!._id,
        format: 'pdf',
        exportedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="medical-record-${patient.systemId}-${Date.now()}.pdf"`
      );

      // Pipe the PDF stream to response
      pdfStream.pipe(res);
    } catch (error: any) {
      logger.error({ error, patientId: req.params.id }, 'PDF export failed');
      return res.status(500).json({ 
        error: 'InternalServerError', 
        message: 'Failed to generate PDF export' 
      });
    }
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const filter: Record<string, unknown> = {
      patientId: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
      vitalSigns: { $exists: true, $ne: null },
    };

    if (req.query.from || req.query.to) {
      const dateFilter: Record<string, Date> = {};
      if (req.query.from) dateFilter.$gte = new Date(String(req.query.from));
      if (req.query.to) dateFilter.$lte = new Date(String(req.query.to));
      filter.createdAt = dateFilter;
    }

    const encounters = await EncounterModel.find(filter)
      .sort({ createdAt: 1 })
      .select('vitalSigns createdAt')
      .lean();

    const vitalType = req.query.type as string | undefined;

    const readings = encounters
      .filter((e) => e.vitalSigns && Object.keys(e.vitalSigns).length > 0)
      .map((e) => ({
        date: (e as any).createdAt,
        vitals: vitalType
          ? { [vitalType]: (e.vitalSigns as Record<string, unknown>)[vitalType] }
          : e.vitalSigns,
      }))
      .filter((r) => {
        if (!vitalType) return true;
        return (r.vitals as Record<string, unknown>)[vitalType] !== undefined;
      });

    return res.json({ status: 'success', data: readings });
  }),
);

// GET /patients/:id/analytics — computed vital sign statistics
router.get(
  '/:id/analytics',
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const encounters = await EncounterModel.find({
      patientId: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
      prescriptions: { $exists: true, $ne: [] },
    })
      .populate('prescriptions.prescribedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // Flatten all prescriptions from all encounters
    const allPrescriptions = encounters.flatMap((encounter) => {
      return (encounter.prescriptions || []).map((prescription: any) => ({
        ...prescription.toObject(),
        encounterId: encounter._id,
        encounterDate: encounter.createdAt,
      }));
    });

    return res.json({ 
      status: 'success', 
      data: allPrescriptions,
      meta: {
        total: allPrescriptions.length,
        encountersWithPrescriptions: encounters.length,
      }
    });
    })
      .sort({ createdAt: 1 })
      .select('vitalSigns createdAt')
      .lean();

    // Blood pressure analytics
    const bpReadings = encounters
      .filter((e) => e.vitalSigns?.bloodPressure)
      .map((e) => {
        const [sys, dia] = (e.vitalSigns!.bloodPressure as string).split('/').map(Number);
        return { systolic: sys, diastolic: dia, date: (e as any).createdAt };
      })
      .filter((r) => !isNaN(r.systolic) && !isNaN(r.diastolic));

    const bpAnalytics = bpReadings.length > 0 ? {
      latest: { systolic: bpReadings.at(-1)!.systolic, diastolic: bpReadings.at(-1)!.diastolic },
      average: {
        systolic: Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length),
        diastolic: Math.round(bpReadings.reduce((s, r) => s + r.diastolic, 0) / bpReadings.length),
      },
      trend: calcTrend(bpReadings.slice(-5).map((r) => r.systolic)),
      readings: bpReadings.length,
    } : null;

    // Weight analytics
    const weightReadings = encounters
      .filter((e) => e.vitalSigns?.weight != null)
      .map((e) => ({ value: e.vitalSigns!.weight as number, date: (e as any).createdAt }));

    const weightAnalytics = weightReadings.length > 0 ? (() => {
      const latest = weightReadings.at(-1)!.value;
      const thirtyDayStart = weightReadings.find((r) => r.date >= thirtyDaysAgo);
      const change30Days = thirtyDayStart ? +(latest - thirtyDayStart.value).toFixed(1) : null;
      return {
        latest,
        change30Days,
        trend: calcTrend(weightReadings.slice(-5).map((r) => r.value)),
      };
    })() : null;

    // Encounter frequency
    const encounterFrequency = {
      last30Days: encounters.filter((e) => (e as any).createdAt >= thirtyDaysAgo).length,
      last90Days: encounters.filter((e) => (e as any).createdAt >= ninetyDaysAgo).length,
    };

    return res.json({
      status: 'success',
      data: {
        bloodPressure: bpAnalytics,
        weight: weightAnalytics,
        encounterFrequency,
      },
    });
  }),
);

// GET /patients/:id/lab-results — All lab results for a patient
router.get(
  '/:id/lab-results',
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await PatientModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const { sort = 'orderedAt', order = 'desc' } = req.query as Record<string, string>;
    const sortField = ['orderedAt', 'testName'].includes(sort) ? sort : 'orderedAt';
    const sortOrder = order === 'asc' ? 1 : -1;

    const docs = await LabResultModel.find({ patientId: req.params.id, clinicId: req.user!.clinicId })
      .sort({ [sortField]: sortOrder });
    return res.json({ status: 'success', data: docs });
  }),
);

export const patientRoutes = router;
