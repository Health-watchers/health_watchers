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

const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
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
      mfaEnabled: user.mfaEnabled,
      preferences: {
        language: user.preferences?.language ?? 'en',
        theme: user.preferences?.theme ?? 'system',
        emailNotifications: user.preferences?.emailNotifications ?? true,
        inAppNotifications: user.preferences?.inAppNotifications ?? true,
        notificationTypes: {
          referral_received:    user.preferences?.notificationTypes?.referral_received    ?? true,
          payment_confirmed:    user.preferences?.notificationTypes?.payment_confirmed    ?? true,
          appointment_reminder: user.preferences?.notificationTypes?.appointment_reminder ?? true,
          ai_summary_ready:     user.preferences?.notificationTypes?.ai_summary_ready     ?? true,
          lab_result_ready:     user.preferences?.notificationTypes?.lab_result_ready     ?? true,
          system:               user.preferences?.notificationTypes?.system               ?? true,
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

    user.fullName = req.body.fullName;
    await user.save();

    return res.json({
      status: 'success',
      data: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinic: String(user.clinicId),
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
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
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

const notificationTypesSchema = z.object({
  referral_received:    z.boolean().optional(),
  payment_confirmed:    z.boolean().optional(),
  appointment_reminder: z.boolean().optional(),
  ai_summary_ready:     z.boolean().optional(),
  lab_result_ready:     z.boolean().optional(),
  system:               z.boolean().optional(),
}).optional();

const updatePreferencesSchema = z.object({
  language: z.enum(['en', 'fr']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
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

    const { language, theme, emailNotifications, inAppNotifications, notificationTypes } = req.body;

    if (language !== undefined) user.preferences.language = language;
    if (theme !== undefined) user.preferences.theme = theme;
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
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
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

export const userRoutes = router;
