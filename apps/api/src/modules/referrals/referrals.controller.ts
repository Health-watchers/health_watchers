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
import { sendReferralNotificationEmail } from '@api/lib/email.service';

const router = Router();
router.use(authenticate);

const DOCTOR_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// POST /referrals — create a referral
router.post(
  '/',
  DOCTOR_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { toClinicId, patientId, reason, urgency, encounterId, sharedData, notes } = req.body;

    if (!toClinicId || !patientId || !reason || !urgency) {
      return res.status(400).json({ error: 'ValidationError', message: 'toClinicId, patientId, reason, urgency are required' });
    }

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
  asyncHandler(async (req: Request, res: Response) => {
    const referrals = await ReferralModel.find({ fromClinicId: req.user!.clinicId })
      .sort({ createdAt: -1 })
      .populate('patientId', 'firstName lastName systemId')
      .populate('toClinicId', 'name')
      .lean();
    return res.json({ status: 'success', data: referrals });
  }),
);

// GET /referrals/incoming — referrals received by this clinic
router.get(
  '/incoming',
  asyncHandler(async (req: Request, res: Response) => {
    const referrals = await ReferralModel.find({ toClinicId: req.user!.clinicId })
      .sort({ createdAt: -1 })
      .populate('patientId', 'firstName lastName systemId')
      .populate('fromClinicId', 'name')
      .lean();
    return res.json({ status: 'success', data: referrals });
  }),
);

// PUT /referrals/:id/accept
router.put(
  '/:id/accept',
  DOCTOR_ROLES,
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

export const referralRoutes = router;
