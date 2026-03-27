import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { LoginDto, RefreshDto, loginSchema, refreshSchema } from './auth.validation';
import { UserModel } from './models/user.model';
import {
  signAccessToken, signRefreshToken, signTempToken,
  verifyRefreshToken, verifyTempToken,
} from './token.service';

const router = Router();
const INVALID = 'Invalid email or password';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate a user and obtain JWT tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     refreshToken: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       423:
 *         description: Account temporarily locked due to too many failed login attempts
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', validateRequest({ body: loginSchema }), async (req: LoginReq, res: Response) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase().trim() });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: INVALID });

  // --- account lockout check ---
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    res.set('Retry-After', String(retryAfterSecs));
    return res.status(423).json({
      error: 'AccountLocked',
      message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
      retryAfter: retryAfterSecs,
    });
  }

  // --- password check ---
  const passwordValid = await bcrypt.compare(req.body.password, user.password);
  if (!passwordValid) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }

    await user.save();
    return res.status(401).json({ error: 'Unauthorized', message: INVALID });
  }

  // --- successful login: reset lockout counters ---
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
  }

  if (user.mfaEnabled) {
    return res.json({ status: 'mfa_required', data: { mfaRequired: true, tempToken: signTempToken(user.id) } });
  }

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  return res.json({ status: 'success', data: { accessToken: signAccessToken(p), refreshToken: signRefreshToken(p) } });
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh an access token using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/refresh', validateRequest({ body: refreshSchema }), async (req: RefreshReq, res: Response) => {
  const decoded = verifyRefreshToken(req.body.refreshToken);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
  const user = await UserModel.findById(decoded.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
  return res.json({ status: 'success', data: { accessToken: signAccessToken({ userId: user.id, role: user.role, clinicId: String(user.clinicId) }) } });
});

/**
 * @swagger
 * /auth/mfa/setup:
 *   post:
 *     summary: Generate a TOTP secret and QR code URI for MFA setup
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP secret and QR code URI generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     otpauthUrl: { type: string, description: "otpauth:// URI for QR code scanning" }
 *                     qrCodeDataUrl: { type: string, description: Base64 PNG data URL of the QR code }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('+mfaSecret');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const secret = generateSecret();
  user.mfaSecret = secret;
  await user.save();

  const otpauthUrl = generateURI({ label: user.email, issuer: 'Health Watchers', secret });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  return res.json({ status: 'success', data: { otpauthUrl, qrCodeDataUrl } });
});

/**
 * @swagger
 * /auth/mfa/verify:
 *   post:
 *     summary: Verify TOTP code and enable MFA on the account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [totp]
 *             properties:
 *               totp: { type: string, length: 6, example: "123456" }
 *     responses:
 *       200:
 *         description: MFA enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     mfaEnabled: { type: boolean, example: true }
 *       400:
 *         description: Invalid TOTP code
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized or MFA not set up
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/mfa/verify', authenticate, validateRequest({ body: mfaVerifySchema }), async (req: Request<Record<string, never>, unknown, MfaVerifyDto>, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('+mfaSecret');
  if (!user || !user.mfaSecret) return res.status(401).json({ error: 'Unauthorized', message: 'MFA setup not initiated' });

  const result = await totpVerify({ token: req.body.totp, secret: user.mfaSecret! });
  const valid = result.valid;
  if (!valid) return res.status(400).json({ error: 'InvalidCode', message: 'Invalid TOTP code' });

  user.mfaEnabled = true;
  await user.save();

  return res.json({ status: 'success', data: { mfaEnabled: true } });
});

/**
 * @swagger
 * /auth/mfa/challenge:
 *   post:
 *     summary: Complete MFA login — exchange temp token + TOTP for real tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tempToken, totp]
 *             properties:
 *               tempToken: { type: string, description: Temp token received from /auth/login }
 *               totp:      { type: string, length: 6, example: "123456" }
 *     responses:
 *       200:
 *         description: MFA verified — full tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     refreshToken: { type: string }
 *       401:
 *         description: Invalid or expired temp token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       400:
 *         description: Invalid TOTP code
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/mfa/challenge', validateRequest({ body: mfaChallengeSchema }), async (req: Request<Record<string, never>, unknown, MfaChallengeDto>, res: Response) => {
  const userId = verifyTempToken(req.body.tempToken);
  if (!userId) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired temp token' });

  const user = await UserModel.findById(userId).select('+mfaSecret');
  if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid session' });

  const result = await totpVerify({ token: req.body.totp, secret: user.mfaSecret! });
  const valid = result.valid;
  if (!valid) return res.status(400).json({ error: 'InvalidCode', message: 'Invalid TOTP code' });

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  return res.json({ status: 'success', data: { accessToken: signAccessToken(p), refreshToken: signRefreshToken(p) } });
});

/**
 * @swagger
 * /auth/unlock:
 *   post:
 *     summary: Manually unlock a locked user account (SUPER_ADMIN only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Account unlocked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     unlocked: { type: boolean, example: true }
 *                     email:    { type: string }
 *       403:
 *         description: Forbidden — SUPER_ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/unlock', authenticate, async (req: Request, res: Response) => {
  if (req.user!.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });

  const { email } = req.body as { email?: string };
  if (!email)
    return res.status(400).json({ error: 'BadRequest', message: 'email is required' });

  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  return res.json({ status: 'success', data: { unlocked: true, email: user.email } });
});

export const authRoutes = router;