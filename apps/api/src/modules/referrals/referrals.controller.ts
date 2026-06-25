import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { ReferralModel } from './referral.model';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { AuditLogModel } from '../audit/audit.model';
import { ClinicModel } from '../clinics/clinic.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { parsePagination } from '@api/utils/paginate';
import { sendReferralNotificationEmail } from '@api/lib/email.service';
import {
  createReferralSchema,
  listReferralsQuerySchema,
  idParamSchema,
} from './referrals.validation';
import { z } from 'zod';

const declineBodySchema = z.object({ declinedReason: z.string().max(2000).optional() });

const router = Router();
router.use(authenticate);

const DOCTOR_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// POST /referrals — create a referral
router.post(
  '/',
  DOCTOR_ROLES,
  validateRequest({ body: createReferralSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { toClinicId, patientId, reason, urgency, encounterId, sharedData, notes } = req.body;

    // Verify patient belongs to the referring clinic and has data_sharing consent
    const patient = await PatientModel.findOne({ _id: patientId, clinicId: req.user!.clinicId, isActive: true });
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    if (!(patient as any).dataSharingConsent) {
      return res.status(403).json({ error: 'ConsentRequired', message: 'Patient has not given data sharing consent' });
    }

    const toClinic = await ClinicModel.findById(toClinicId);
    if (!toClinic) return res.status(404).json({ error: 'NotFound', message: 'Target clinic not found' });

    const referral = await ReferralModel.create({
      fromClinicId: req.user!.clinicId,
      toClinicId,
      patientId,
      referredBy: req.user!.userId,
      reason,
      urgency,
      encounterId: encounterId || undefined,
      sharedData: sharedData ?? { demographics: true, encounters: false, labResults: false, prescriptions: false },
      notes,
    });

    // Notify receiving clinic — find CLINIC_ADMIN of target clinic
    const admin = await UserModel.findOne({ clinicId: toClinicId, role: 'CLINIC_ADMIN' }).lean();
    if (admin?.email) {
      sendReferralNotificationEmail(admin.email, admin.fullName, {
        patientName: `${(patient as any).firstName} ${(patient as any).lastName}`,
        urgency,
        reason,
        referralId: String(referral._id),
      });
    }

    await AuditLogModel.create({
      userId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      action: 'REFERRAL_CREATE',
      resourceType: 'Referral',
      resourceId: String(referral._id),
      outcome: 'SUCCESS',
      timestamp: new Date(),
    });

    return res.status(201).json({ status: 'success', data: referral });
  }),
);

// GET /referrals/outgoing — referrals sent by this clinic
router.get(
  '/outgoing',
  validateRequest({ query: listReferralsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter = { fromClinicId: req.user!.clinicId };
    const [data, total] = await Promise.all([
      ReferralModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('patientId', 'firstName lastName systemId')
        .populate('toClinicId', 'name')
        .lean(),
      ReferralModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(total / limit);
    return res.json({
      status: 'success',
      data,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  }),
);

// GET /referrals/incoming — referrals received by this clinic
router.get(
  '/incoming',
  validateRequest({ query: listReferralsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const filter = { toClinicId: req.user!.clinicId };
    const [data, total] = await Promise.all([
      ReferralModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('patientId', 'firstName lastName systemId')
        .populate('fromClinicId', 'name')
        .lean(),
      ReferralModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(total / limit);
    return res.json({
      status: 'success',
      data,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  }),
);

// PUT /referrals/:id/accept
router.put(
  '/:id/accept',
  DOCTOR_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const referral = await ReferralModel.findOne({ _id: req.params.id, toClinicId: req.user!.clinicId, status: 'pending' });
    if (!referral) return res.status(404).json({ error: 'NotFound', message: 'Pending referral not found' });

    referral.status = 'accepted';
    referral.acceptedBy = new Types.ObjectId(req.user!.userId);
    referral.acceptedAt = new Date();
    await referral.save();

    await AuditLogModel.create({
      userId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      action: 'REFERRAL_ACCEPT',
      resourceType: 'Referral',
      resourceId: String(referral._id),
      outcome: 'SUCCESS',
      timestamp: new Date(),
    });

    return res.json({ status: 'success', data: referral });
  }),
);

// PUT /referrals/:id/decline
router.put(
  '/:id/decline',
  DOCTOR_ROLES,
  validateRequest({ params: idParamSchema, body: declineBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { declinedReason } = req.body;
    const referral = await ReferralModel.findOne({ _id: req.params.id, toClinicId: req.user!.clinicId, status: 'pending' });
    if (!referral) return res.status(404).json({ error: 'NotFound', message: 'Pending referral not found' });

    referral.status = 'declined';
    referral.declinedReason = declinedReason;
    await referral.save();

    return res.json({ status: 'success', data: referral });
  }),
);

// GET /referrals/:id/patient-data — access shared patient data (accepted referrals only)
router.get(
  '/:id/patient-data',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const referral = await ReferralModel.findOne({
      _id: req.params.id,
      toClinicId: req.user!.clinicId,
      status: 'accepted',
    });
    if (!referral) return res.status(404).json({ error: 'NotFound', message: 'Accepted referral not found' });

    const { sharedData, patientId } = referral;
    const result: Record<string, unknown> = {};

    if (sharedData.demographics) {
      result.demographics = await PatientModel.findById(patientId).lean();
    }
    if (sharedData.encounters) {
      result.encounters = await EncounterModel.find({ patientId, isActive: true }).sort({ createdAt: -1 }).lean();
    }
    if (sharedData.labResults) {
      result.labResults = await LabResultModel.find({ patientId }).sort({ orderedAt: -1 }).lean();
    }
    if (sharedData.prescriptions) {
      const encounters = await EncounterModel.find({ patientId, isActive: true, prescriptions: { $exists: true, $ne: [] } }).lean();
      result.prescriptions = encounters.flatMap((e: any) => e.prescriptions ?? []);
    }

    // Audit cross-clinic data access
    await AuditLogModel.create({
      userId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      action: 'REFERRAL_DATA_ACCESS',
      resourceType: 'Referral',
      resourceId: String(referral._id),
      metadata: { patientId: String(patientId), sharedData },
      outcome: 'SUCCESS',
      timestamp: new Date(),
    });

    return res.json({ status: 'success', data: result });
  }),
);

// PATCH /referrals/:id/outcome — record referral outcome
router.patch(
  '/:id/outcome',
  DOCTOR_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { outcome, outcomeNotes } = req.body;

    if (!outcome || !['attended', 'no-show', 'cancelled', 'pending'].includes(outcome)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Valid outcome required' });
    }

    const referral = await ReferralModel.findOne({
      _id: req.params.id,
      toClinicId: req.user!.clinicId,
      status: 'accepted',
    });
    if (!referral) return res.status(404).json({ error: 'NotFound', message: 'Accepted referral not found' });

    referral.outcome = outcome as any;
    referral.outcomeDate = new Date();
    referral.outcomeNotes = outcomeNotes;
    if (outcome !== 'pending') {
      referral.completedAt = new Date();
      referral.status = 'completed';
    }
    await referral.save();

    // Notify referring doctor
    const referringDoctor = await UserModel.findById(referral.referredBy).lean();
    if (referringDoctor?.email) {
      const { sendOutcomeNotificationEmail } = await import('@api/lib/email.service');
      sendOutcomeNotificationEmail(referringDoctor.email, referringDoctor.fullName, {
        outcome,
        referralId: String(referral._id),
      });
    }

    await AuditLogModel.create({
      userId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      action: 'REFERRAL_OUTCOME_RECORD',
      resourceType: 'Referral',
      resourceId: String(referral._id),
      metadata: { outcome, outcomeNotes },
      outcome: 'SUCCESS',
      timestamp: new Date(),
    });

    return res.json({ status: 'success', data: referral });
  }),
);

// GET /referrals/analytics — referral analytics and metrics
router.get(
  '/analytics',
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const referrals = await ReferralModel.find({ toClinicId: clinicId }).lean();

    const completed = referrals.filter((r: any) => r.status === 'completed');
    const completionRate = referrals.length > 0 ? (completed.length / referrals.length) * 100 : 0;

    const attended = referrals.filter((r: any) => r.outcome === 'attended');
    const attendanceRate = completed.length > 0 ? (attended.length / completed.length) * 100 : 0;

    // Calculate average time to completion
    const completedWithDates = completed.filter((r: any) => r.createdAt && r.completedAt);
    const avgTimeToCompletion =
      completedWithDates.length > 0
        ? completedWithDates.reduce((sum: number, r: any) => {
            const days = (r.completedAt - r.createdAt) / (1000 * 60 * 60 * 24);
            return sum + days;
          }, 0) / completedWithDates.length
        : 0;

    // Top referral destinations
    const destinations = await ReferralModel.aggregate([
      { $match: { toClinicId: new Types.ObjectId(clinicId) } },
      { $group: { _id: '$fromClinicId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'clinics', localField: '_id', foreignField: '_id', as: 'clinic' } },
    ]);

    return res.json({
      status: 'success',
      data: {
        totalReferrals: referrals.length,
        completedReferrals: completed.length,
        completionRate: Math.round(completionRate * 100) / 100,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        avgTimeToCompletionDays: Math.round(avgTimeToCompletion * 100) / 100,
        topReferralSources: destinations.map((d: any) => ({
          clinicId: d._id,
          clinicName: d.clinic[0]?.name || 'Unknown',
          referralCount: d.count,
        })),
      },
    });
  }),
);

export const referralRoutes = router;
