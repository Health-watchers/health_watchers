import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { toPatientResponse } from '../patients/patients.transformer';
import { AppointmentModel } from '../appointments/appointment.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { signAccessToken, signRefreshToken, REFRESH_TOKEN_EXPIRY_MS } from '../auth/token.service';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';
import crypto from 'crypto';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string().min(1), // used as second factor to confirm identity
});

const requirePatient = requireRoles('PATIENT');

// ── POST /api/v1/portal/auth/login ────────────────────────────────────────────
router.post(
  '/auth/login',
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, dateOfBirth } = req.body as { email: string; dateOfBirth: string };

    const user = await UserModel.findOne({ email: email.toLowerCase().trim(), role: 'PATIENT', isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    // Verify date of birth against linked patient record
    const patient = await PatientModel.findById(user.patientId);
    if (!patient) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Patient record not found' });
    }

    // dateOfBirth stored encrypted; compare decrypted value
    const storedDob = (patient as any).dateOfBirth as string;
    if (storedDob !== dateOfBirth) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const payload = {
      userId: String(user._id),
      role: 'PATIENT',
      clinicId: String(user.clinicId),
      patientId: String(user.patientId),
    };

    const accessToken = signAccessToken(payload);
    const { token: refreshToken, jti, family } = signRefreshToken(payload);

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      jti,
      family,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });

    return res.json({ status: 'success', data: { accessToken, refreshToken } });
  }),
);

// ── GET /api/v1/portal/me ─────────────────────────────────────────────────────
router.get(
  '/me',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await PatientModel.findById(req.user!.patientId);
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(patient) });
  }),
);

// ── GET /api/v1/portal/appointments ──────────────────────────────────────────
router.get(
  '/appointments',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const appointments = await AppointmentModel.find({
      patientId: req.user!.patientId,
      clinicId: req.user!.clinicId,
    })
      .sort({ scheduledAt: -1 })
      .lean();
    return res.json({ status: 'success', data: appointments });
  }),
);

// ── GET /api/v1/portal/invoices ───────────────────────────────────────────────
router.get(
  '/invoices',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const invoices = await PaymentRecordModel.find({
      patientId: req.user!.patientId,
      clinicId: req.user!.clinicId,
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ status: 'success', data: invoices });
  }),
);

// ── POST /api/v1/portal/invoices/:id/pay ─────────────────────────────────────
// Marks a pending invoice as confirmed (actual Stellar tx handled client-side)
router.post(
  '/invoices/:id/pay',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const { txHash } = req.body as { txHash?: string };

    const invoice = await PaymentRecordModel.findOneAndUpdate(
      { _id: req.params.id, patientId: req.user!.patientId, clinicId: req.user!.clinicId, status: 'pending' },
      { status: 'confirmed', txHash, confirmedAt: new Date() },
      { new: true },
    );

    if (!invoice) {
      return res.status(404).json({ error: 'NotFound', message: 'Invoice not found or already paid' });
    }

    return res.json({ status: 'success', data: invoice });
  }),
);

export { router as portalRoutes };
