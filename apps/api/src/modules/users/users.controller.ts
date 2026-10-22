import path from 'path';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { UserModel } from '../auth/models/user.model';
import { ClinicModel } from '../clinics/clinic.model';
import { totpService } from '../auth/totp.service';
import { addToDenylist } from '@api/services/token-denylist.service';
import { passwordSchema } from '../auth/auth.validation';
import {
  countryName,
  fingerprintDevice,
  listKnownDevices,
} from '../auth/services/login-alert.service';
import { imageUpload } from '@api/middlewares/upload.middleware';
import { uploadFile, getDownloadUrl, deleteFile } from '../documents/storage.service';

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100).optional(),
  timezone: z.string().optional(),
});

const router = Router();

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fullName:    { type: string }
 *                     email:       { type: string }
 *                     role:        { type: string }
 *                     clinic:      { type: string }
 *                     mfaEnabled:  { type: boolean }
 *                     preferences:
 *                       type: object
 *                       properties:
 *                         language:             { type: string }
 *                         emailNotifications:   { type: boolean }
 *                         inAppNotifications:   { type: boolean }
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }

  const clinic = await ClinicModel.findById(user.clinicId).lean<{ name: string } | null>();

  return res.json({
    status: 'success',
    data: {
      userId: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      clinic: String(user.clinicId),
      clinicName: clinic?.name ?? null,
      avatarUrl: user.avatarUrl ?? null,
      timezone: user.timezone ?? null,
      mfaEnabled: user.mfaEnabled,
      preferences: {
        language: user.preferences?.language ?? 'en',
        theme: user.preferences?.theme ?? 'system',
        defaultView: user.preferences?.defaultView ?? 'dashboard',
        emailNotifications: user.preferences?.emailNotifications ?? true,
        inAppNotifications: user.preferences?.inAppNotifications ?? true,
        notificationTypes: {
          referral_received: user.preferences?.notificationTypes?.referral_received ?? true,
          payment_confirmed: user.preferences?.notificationTypes?.payment_confirmed ?? true,
          appointment_reminder: user.preferences?.notificationTypes?.appointment_reminder ?? true,
          ai_summary_ready: user.preferences?.notificationTypes?.ai_summary_ready ?? true,
          lab_result_ready: user.preferences?.notificationTypes?.lab_result_ready ?? true,
          system: user.preferences?.notificationTypes?.system ?? true,
        },
      },
    },
  });
});

/**
 * @swagger
 * /users/me/profile:
 *   patch:
 *     summary: Update the authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName]
 *             properties:
 *               fullName: { type: string, minLength: 1, maxLength: 100 }
 *     responses:
 *       200:
 *         description: Updated user profile
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch(
  '/me/profile',
  authenticate,
  validateRequest({ body: updateProfileSchema }),
  async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const { fullName, timezone } = req.body;

    if (fullName !== undefined) user.fullName = fullName;
    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Invalid timezone '${timezone}'. Use a valid IANA timezone e.g. 'Africa/Lagos'.`,
        });
      }
      user.timezone = timezone;
    }
    await user.save();

    return res.json({
      status: 'success',
      data: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinic: String(user.clinicId),
        avatarUrl: user.avatarUrl ?? null,
        timezone: user.timezone ?? null,
        mfaEnabled: user.mfaEnabled,
        preferences: {
          language: user.preferences?.language ?? 'en',
          emailNotifications: user.preferences?.emailNotifications ?? true,
          inAppNotifications: user.preferences?.inAppNotifications ?? true,
        },
      },
    });
  }
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

/**
 * @swagger
 * /users/me/password:
 *   post:
 *     summary: Change the authenticated user's password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Current password is incorrect or validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/me/password',
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Current password is incorrect',
      });
    }

    user.password = req.body.newPassword;
    await user.save();

    // Denylist the current access token so it can't be reused after password change
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7);
      const tokenData = jwt.decode(rawToken) as { jti?: string; exp?: number } | null;
      if (tokenData?.jti && tokenData?.exp) {
        const ttl = tokenData.exp - Math.floor(Date.now() / 1000);
        await addToDenylist(tokenData.jti, ttl);
      }
    }

    return res.json({
      status: 'success',
      message: 'Password updated successfully',
    });
  }
);

const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
});

/**
 * @swagger
 * /users/me/mfa/enable:
 *   post:
 *     summary: Generate a TOTP secret and QR code for MFA setup
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code URL and secret for MFA setup
 *       401:
 *         description: Unauthorized
 */
router.post('/me/mfa/enable', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }

  const {
    secret,
    otpauthUrl: _otpauthUrl,
    qrCodeDataUrl: qrCodeUrl,
  } = await totpService.setup(user.email);
  user.mfaSecret = secret;
  await user.save();

  return res.json({
    status: 'success',
    data: { qrCodeUrl, secret },
  });
});

/**
 * @swagger
 * /users/me/mfa/verify:
 *   post:
 *     summary: Verify a TOTP code and activate MFA
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, pattern: '^\d{6}$' }
 *     responses:
 *       200:
 *         description: MFA enabled successfully
 *       400:
 *         description: Invalid verification code
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/me/mfa/verify',
  authenticate,
  validateRequest({ body: mfaVerifySchema }),
  async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId).select('+mfaSecret');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const isValid = totpService.verify(req.body.code, user.mfaSecret ?? '');

    if (!isValid) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid verification code',
      });
    }

    user.mfaEnabled = true;
    await user.save();

    return res.json({
      status: 'success',
      message: 'MFA enabled successfully',
    });
  }
);

/**
 * @swagger
 * /users/me/mfa/disable:
 *   post:
 *     summary: Disable MFA for the authenticated user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/me/mfa/disable', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  await user.save();

  return res.json({
    status: 'success',
    message: 'MFA disabled successfully',
  });
});

const notificationTypesSchema = z
  .object({
    referral_received: z.boolean().optional(),
    payment_confirmed: z.boolean().optional(),
    appointment_reminder: z.boolean().optional(),
    ai_summary_ready: z.boolean().optional(),
    lab_result_ready: z.boolean().optional(),
    system: z.boolean().optional(),
  })
  .optional();

const updatePreferencesSchema = z.object({
  language: z.enum(['en', 'fr', 'pt', 'yo', 'ha']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultView: z.enum(['dashboard', 'patients', 'appointments', 'encounters']).optional(),
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  notificationTypes: notificationTypesSchema,
});

/**
 * @swagger
 * /users/me/preferences:
 *   patch:
 *     summary: Update the authenticated user's preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language:             { type: string, enum: [en, fr] }
 *               emailNotifications:   { type: boolean }
 *               inAppNotifications:   { type: boolean }
 *     responses:
 *       200:
 *         description: Updated preferences
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch(
  '/me/preferences',
  authenticate,
  validateRequest({ body: updatePreferencesSchema }),
  async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const { language, theme, defaultView, emailNotifications, inAppNotifications, notificationTypes } = req.body;

    if (language !== undefined) user.preferences.language = language;
    if (theme !== undefined) user.preferences.theme = theme;
    if (defaultView !== undefined) user.preferences.defaultView = defaultView;
    if (emailNotifications !== undefined) user.preferences.emailNotifications = emailNotifications;
    if (inAppNotifications !== undefined) user.preferences.inAppNotifications = inAppNotifications;
    if (notificationTypes !== undefined) {
      Object.assign(user.preferences.notificationTypes, notificationTypes);
    }

    await user.save();

    return res.json({
      status: 'success',
      data: {
        preferences: {
          language: user.preferences.language,
          theme: user.preferences.theme,
          defaultView: user.preferences.defaultView ?? 'dashboard',
          emailNotifications: user.preferences.emailNotifications,
          inAppNotifications: user.preferences.inAppNotifications,
          notificationTypes: user.preferences.notificationTypes,
        },
      },
    });
  }
);

/**
 * @swagger
 * /users/sessions:
 *   get:
 *     summary: Get all active sessions for the current user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }

  // Return mock sessions for now - in production, track actual sessions
  const currentSessionId = (req as any).sessionId || 'current';
  const sessions = [
    {
      id: currentSessionId,
      userAgent: req.headers['user-agent'] || 'Unknown',
      ipAddress:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (req.headers['x-real-ip'] as string) ||
        req.socket.remoteAddress ||
        'Unknown',
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isCurrent: true,
    },
  ];

  return res.json({
    status: 'success',
    data: sessions,
  });
});

/**
 * @swagger
 * /users/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke a specific session
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked
 *       401:
 *         description: Unauthorized
 */
router.delete('/sessions/:sessionId', authenticate, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const currentSessionId = (req as any).sessionId || 'current';

  if (sessionId === currentSessionId) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Cannot revoke the current session',
    });
  }

  // In production, invalidate the session token
  return res.json({
    status: 'success',
    message: 'Session revoked',
  });
});

/**
 * POST /users/me/avatar — upload a profile avatar (PNG/JPEG/WebP, max 5 MB)
 */
router.post(
  '/me/avatar',
  authenticate,
  (req: Request, res: Response, next) => {
    imageUpload.single('avatar')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FileTooLarge', message: 'Avatar must be under 5 MB.' });
      }
      if ((err as any).code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'InvalidFileType', message: 'Avatar must be a PNG, JPEG, or WebP image.' });
      }
      return next(err);
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'No avatar file provided.' });
    }
    const user = await UserModel.findById(req.user!.userId).select('+avatarStorageKey');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    // Delete old avatar if it exists
    if (user.avatarStorageKey) {
      await deleteFile(user.avatarStorageKey).catch(() => {});
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const storageKey = `user-avatar/${String(user._id)}/${crypto.randomUUID()}${ext}`;
    await uploadFile({ storageKey, buffer: req.file.buffer, mimeType: req.file.mimetype });
    const avatarUrl = await getDownloadUrl(storageKey);

    user.avatarUrl = avatarUrl;
    user.avatarStorageKey = storageKey;
    await user.save();

    return res.json({ status: 'success', data: { avatarUrl } });
  }
);

/**
 * DELETE /users/me/avatar — remove the current avatar
 */
router.delete('/me/avatar', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('+avatarStorageKey');
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }
  if (user.avatarStorageKey) {
    await deleteFile(user.avatarStorageKey).catch(() => {});
  }
  user.avatarUrl = undefined;
  user.avatarStorageKey = undefined;
  await user.save();
  return res.json({ status: 'success', data: { avatarUrl: null } });
});

/**
 * POST /users/me/deactivate — soft-deactivate the current user's account
 * Requires the current password as confirmation.
 */
router.post('/me/deactivate', authenticate, async (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'BadRequest', message: 'Password confirmation is required.' });
  }
  const user = await UserModel.findById(req.user!.userId).select('+password');
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(403).json({ error: 'Forbidden', message: 'Incorrect password.' });
  }
  user.isActive = false;
  await user.save();

  // Denylist the current access token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7);
    const tokenData = jwt.decode(rawToken) as { jti?: string; exp?: number } | null;
    if (tokenData?.jti && tokenData?.exp) {
      const ttl = tokenData.exp - Math.floor(Date.now() / 1000);
      await addToDenylist(tokenData.jti, ttl);
    }
  }

  return res.json({ status: 'success', message: 'Account deactivated.' });
});

/**
 * @swagger
 * /users/devices:
 *   get:
 *     summary: Devices recognised for the current user (#1497)
 *     description: >
 *       Devices the account has signed in from, with the approximate (country-level)
 *       locations seen for each. A sign-in from a device or country not on this list
 *       triggers a security alert.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recognised devices, most recently used first
 *       401:
 *         description: Unauthorized
 */
router.get('/devices', authenticate, async (req: Request, res: Response) => {
  const devices = await listKnownDevices(req.user!.userId);
  const current = fingerprintDevice(req.headers['user-agent']);
  return res.json({
    status: 'success',
    data: devices.map((d) => ({
      id: String(d._id),
      deviceLabel: d.deviceLabel,
      countries: (d.countries ?? []).map((code) => ({ code, name: countryName(code) })),
      lastLocation: countryName(d.lastCountry),
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      isCurrent: d.fingerprint === current,
    })),
  });
});

export const userRoutes = router;
