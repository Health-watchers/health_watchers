import { Request, Response, Router } from 'express';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { authenticate } from '@api/middlewares/auth.middleware';
import { loginAlertRevokeSchema } from './auth.validation';
import { ClinicModel } from '../clinics/clinic.model';
import {
  ClinicSettingsModel,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
} from '../clinics/clinic-settings.model';
import { UserModel } from './models/user.model';
import { RefreshTokenModel } from './models/refresh-token.model';
import { signAccessToken, signRefreshToken, REFRESH_TOKEN_EXPIRY_MS } from './token.service';
import { auditLog } from '../audit/audit.service';
import { setUserInvalidatedAt } from '@api/services/token-denylist.service';
import { revokeSessionsForAlert } from './services/login-alert.service';
import { passkeyRoutes } from './passkey.controller';
import { loginRoutes } from './login.routes';
import { refreshRoutes } from './refresh.routes';
import { mfaRoutes } from './mfa.routes';
import { passwordResetRoutes } from './password-reset.routes';

const router = Router();

// Sub-resource routers (login, refresh/logout, MFA, password reset)
router.use(loginRoutes);
router.use(refreshRoutes);
router.use(mfaRoutes);
router.use(passwordResetRoutes);

/**
 * @swagger
 * /auth/session-policy:
 *   get:
 *     summary: Session policy for the caller's clinic (idle timeout before automatic logoff)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/session-policy', authenticate, async (req: Request, res: Response) => {
  const settings = await ClinicSettingsModel.findOne({ clinicId: req.user!.clinicId })
    .select('security')
    .lean();
  return res.json({
    status: 'success',
    data: {
      idleTimeoutMinutes: settings?.security?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES,
      warningSeconds: 60,
    },
  });
});

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Revoke all sessions for the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  // Revoke all refresh tokens
  await RefreshTokenModel.deleteMany({ userId });
  // Store invalidation timestamp — all access tokens issued before now are rejected
  await setUserInvalidatedAt(userId, Math.floor(Date.now() / 1000));
  return res.json({ status: 'success', data: { loggedOut: true } });
});

/**
 * @swagger
 * /auth/login-alerts/revoke:
 *   post:
 *     summary: '"This wasn''t me" — revoke every session from a new sign-in alert (#1497)'
 *     description: >
 *       Public endpoint behind the link in new-device / new-country sign-in alerts.
 *       The single-use token revokes all refresh tokens and access tokens for the
 *       account and forgets the reported device.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: All sessions revoked
 *       400:
 *         description: Invalid, expired or already used link
 */
router.post(
  '/login-alerts/revoke',
  validateRequest({ body: loginAlertRevokeSchema }),
  async (req: Request, res: Response) => {
    const result = await revokeSessionsForAlert(req.body.token, req);
    if (!result) {
      return res.status(400).json({
        error: 'InvalidToken',
        message: 'This link is invalid, has expired or was already used',
      });
    }
    return res.json({ status: 'success', data: { sessionsRevoked: true } });
  }
);

/**
 * @swagger
 * /auth/unlock:
 *   post:
 *     summary: Manually unlock a locked user account (SUPER_ADMIN only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/unlock', authenticate, async (req: Request, res: Response) => {
  if (req.user!.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });

  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'BadRequest', message: 'email is required' });

  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });

  user.failedLoginAttempts = 0;
  user.failedMfaAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  await auditLog(
    {
      action: 'ACCOUNT_UNLOCKED',
      userId: user.id,
      clinicId: String(user.clinicId),
      outcome: 'SUCCESS',
      metadata: { email: user.email, unlockedBy: req.user!.userId },
    },
    req
  );

  return res.json({ status: 'success', data: { unlocked: true, email: user.email } });
});

/**
 * @swagger
 * /auth/switch-clinic:
 *   post:
 *     summary: Switch the active clinic for a SUPER_ADMIN and obtain tokens scoped to it
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clinicId]
 *             properties:
 *               clinicId: { type: string, description: MongoDB ObjectId of the target clinic }
 *     responses:
 *       200:
 *         description: New access + refresh tokens scoped to the selected clinic
 *       400: { description: Missing or invalid clinicId }
 *       403: { description: Caller is not a SUPER_ADMIN }
 *       404: { description: Clinic not found }
 */
router.post('/switch-clinic', authenticate, async (req: Request, res: Response) => {
  if (req.user!.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });

  const { clinicId } = req.body as { clinicId?: string };
  if (!clinicId || !/^[a-f\d]{24}$/i.test(clinicId))
    return res.status(400).json({ error: 'BadRequest', message: 'A valid clinicId is required' });

  const clinic = await ClinicModel.findById(clinicId);
  if (!clinic || clinic.isActive === false)
    return res.status(404).json({ error: 'NotFound', message: 'Clinic not found or inactive' });

  const user = await UserModel.findById(req.user!.userId);
  if (!user || !user.isActive)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid session' });

  const previousClinicId = req.user!.clinicId;
  const p = { userId: user.id, role: user.role, clinicId, isSuperAdmin: true };
  const { token: refreshToken, jti, family } = signRefreshToken(p);
  await RefreshTokenModel.create({
    jti,
    userId: user.id,
    family,
    consumed: false,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  await auditLog(
    {
      action: 'CLINIC_SWITCH',
      userId: user.id,
      clinicId,
      resourceType: 'Clinic',
      resourceId: clinicId,
      metadata: { from: previousClinicId, to: clinicId },
    },
    req
  );

  return res.json({
    status: 'success',
    data: {
      accessToken: signAccessToken(p),
      refreshToken,
      clinic: { id: String(clinic._id), name: clinic.name },
    },
  });
});

router.use('/passkeys', passkeyRoutes);

export const authRoutes = router;
