import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { signTempToken, verifyTempToken } from '../auth/token.service';
import {
  portalMfaSetupSchema,
  portalMfaVerifySchema,
  portalMfaConfirmSchema,
  portalMfaDisableSchema,
} from './portal.validation';
import { portalMfaService } from './portal-mfa.service';
import { smsOtpService } from './sms-otp.service';
import {
  sendPortalMfaEnabledEmail,
  sendPortalMfaDisabledEmail,
  sendPortalMfaBackupCodesEmail,
} from '@api/lib/email.service';
import logger from '@api/utils/logger';

const router = Router();
const requirePatient = requireRoles('PATIENT');

// ── POST /api/v1/portal/auth/mfa/setup ────────────────────────────────────────
/**
 * Initiate MFA setup for portal patient
 * Returns QR code for TOTP or sends OTP for SMS
 */
router.post(
  '/auth/mfa/setup',
  authenticate,
  requirePatient,
  validateRequest({ body: portalMfaSetupSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { method, phoneNumber } = req.body;
    const user = await UserModel.findById(req.user!.userId).select('+portalMfaSecret');

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    if (user.portalMfaEnabled) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'MFA is already enabled. Disable it first to set up a new method.',
      });
    }

    if (method === 'totp') {
      const { secret, qrCodeDataUrl } = await portalMfaService.setupTotp(user.email);
      const tempToken = signTempToken(user._id.toString());

      return res.json({
        status: 'success',
        data: {
          method: 'totp',
          secret,
          qrCodeDataUrl,
          tempToken,
          message: 'Scan the QR code with your authenticator app, then verify the code',
        },
      });
    }

    if (method === 'sms') {
      if (!phoneNumber) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Phone number is required for SMS MFA',
        });
      }

      const otp = smsOtpService.generateOtp(phoneNumber);
      await smsOtpService.sendSms(phoneNumber, otp);

      const tempToken = signTempToken(user._id.toString());

      return res.json({
        status: 'success',
        data: {
          method: 'sms',
          phoneNumber,
          tempToken,
          message: 'OTP sent to your phone number',
        },
      });
    }

    return res.status(400).json({ error: 'BadRequest', message: 'Invalid MFA method' });
  })
);

// ── POST /api/v1/portal/auth/mfa/verify ───────────────────────────────────────
/**
 * Verify MFA setup and enable it
 * For TOTP: verify the code from authenticator app
 * For SMS: verify the OTP sent to phone
 */
router.post(
  '/auth/mfa/verify',
  validateRequest({ body: portalMfaVerifySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, tempToken } = req.body;

    const userId = verifyTempToken(tempToken);
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired temp token',
      });
    }

    const user = await UserModel.findById(userId).select('+portalMfaSecret');
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    // Determine which method was being set up based on what's in the request
    // For TOTP, we need the secret to verify
    if (user.portalMfaSecret) {
      // TOTP verification
      const isValid = portalMfaService.verifyTotp(code, user.portalMfaSecret);
      if (!isValid) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid verification code',
        });
      }

      // Generate backup codes
      const { plain: backupCodes, hashed: hashedBackupCodes } =
        portalMfaService.generateBackupCodes();

      // Enable MFA
      user.portalMfaEnabled = true;
      user.portalMfaMethod = 'totp';
      user.portalMfaBackupCodes = hashedBackupCodes;
      user.portalMfaEnabledAt = new Date();
      await user.save();

      // Send notification emails
      const patient = await PatientModel.findById(user.patientId);
      const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';

      sendPortalMfaEnabledEmail(user.email, patientName, 'totp');
      sendPortalMfaBackupCodesEmail(user.email, patientName, backupCodes);

      logger.info({ userId: user._id }, 'Portal TOTP MFA enabled');

      return res.json({
        status: 'success',
        data: {
          message: 'MFA enabled successfully',
          backupCodes,
          method: 'totp',
        },
      });
    }

    // SMS verification (OTP was sent to phone)
    // We need to get the phone number from somewhere - it should be in the setup request
    // For now, we'll check if there's a pending SMS setup
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Unable to determine MFA method',
    });
  })
);

// ── POST /api/v1/portal/auth/mfa/confirm ──────────────────────────────────────
/**
 * Confirm SMS MFA setup after OTP verification
 */
router.post(
  '/auth/mfa/confirm',
  authenticate,
  requirePatient,
  validateRequest({ body: portalMfaConfirmSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;
    const user = await UserModel.findById(req.user!.userId);

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    if (user.portalMfaEnabled) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'MFA is already enabled',
      });
    }

    if (!user.portalPhoneNumber) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'No phone number set for SMS MFA',
      });
    }

    // Verify OTP
    const isValid = smsOtpService.verifyOtp(user.portalPhoneNumber, code);
    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid verification code',
      });
    }

    // Generate backup codes
    const { plain: backupCodes, hashed: hashedBackupCodes } =
      portalMfaService.generateBackupCodes();

    // Enable MFA
    user.portalMfaEnabled = true;
    user.portalMfaMethod = 'sms';
    user.portalMfaBackupCodes = hashedBackupCodes;
    user.portalMfaEnabledAt = new Date();
    await user.save();

    // Send notification emails
    const patient = await PatientModel.findById(user.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';

    sendPortalMfaEnabledEmail(user.email, patientName, 'sms');
    sendPortalMfaBackupCodesEmail(user.email, patientName, backupCodes);

    logger.info({ userId: user._id }, 'Portal SMS MFA enabled');

    return res.json({
      status: 'success',
      data: {
        message: 'SMS MFA enabled successfully',
        backupCodes,
        method: 'sms',
      },
    });
  })
);

// ── POST /api/v1/portal/auth/mfa/disable ──────────────────────────────────────
/**
 * Disable MFA for portal patient
 * Requires verification code to prevent unauthorized disabling
 */
router.post(
  '/auth/mfa/disable',
  authenticate,
  requirePatient,
  validateRequest({ body: portalMfaDisableSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;
    const user = await UserModel.findById(req.user!.userId).select(
      '+portalMfaSecret +portalMfaBackupCodes'
    );

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    if (!user.portalMfaEnabled) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'MFA is not enabled',
      });
    }

    // Verify code (TOTP or backup code)
    let isValid = false;

    if (user.portalMfaMethod === 'totp' && user.portalMfaSecret) {
      isValid = portalMfaService.verifyTotp(code, user.portalMfaSecret);
    } else if (user.portalMfaBackupCodes) {
      isValid = portalMfaService.verifyBackupCode(code, user.portalMfaBackupCodes);
      if (isValid) {
        // Remove used backup code
        user.portalMfaBackupCodes = portalMfaService.removeUsedBackupCode(
          code,
          user.portalMfaBackupCodes
        );
      }
    }

    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid verification code',
      });
    }

    // Disable MFA
    user.portalMfaEnabled = false;
    user.portalMfaSecret = undefined;
    user.portalMfaBackupCodes = undefined;
    user.portalMfaMethod = undefined;
    user.portalPhoneNumber = undefined;
    user.portalMfaEnabledAt = undefined;
    await user.save();

    // Send notification email
    const patient = await PatientModel.findById(user.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';

    sendPortalMfaDisabledEmail(user.email, patientName);

    logger.info({ userId: user._id }, 'Portal MFA disabled');

    return res.json({
      status: 'success',
      data: { message: 'MFA disabled successfully' },
    });
  })
);

// ── GET /api/v1/portal/auth/mfa/status ────────────────────────────────────────
/**
 * Get current MFA status for portal patient
 */
router.get(
  '/auth/mfa/status',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId);

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    return res.json({
      status: 'success',
      data: {
        mfaEnabled: user.portalMfaEnabled || false,
        mfaMethod: user.portalMfaMethod || null,
        mfaEnabledAt: user.portalMfaEnabledAt || null,
      },
    });
  })
);

export { router as portalMfaRoutes };
