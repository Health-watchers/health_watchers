import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  LoginDto, RefreshDto, RegisterDto,
  loginSchema, refreshSchema, registerSchema, mfaVerifySchema, mfaChallengeSchema,
  MfaVerifyDto, MfaChallengeDto,
  changePasswordSchema, ChangePasswordDto,
} from './auth.validation';
import { UserModel } from './models/user.model';
import { ClinicModel } from '../clinics/clinic.model';
import {
  signAccessToken, signRefreshToken, signTempToken,
  verifyRefreshToken, verifyTempToken,
} from './token.service';
import { generateSecret, generateURI, totpVerify } from './totp.service';

// ── local type helpers ────────────────────────────────────────────────────
type LoginReq          = Request<Record<string, never>, unknown, LoginDto>;
type RefreshReq        = Request<Record<string, never>, unknown, RefreshDto>;
type RegisterReq       = Request<Record<string, never>, unknown, RegisterDto>;
type ChangePasswordReq = Request<Record<string, never>, unknown, ChangePasswordDto>;

const router = Router();
const INVALID = 'Invalid email or password';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/** SHA-256 hash of a token for safe storage */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Role hierarchy: who can create whom ──────────────────────────────────
const ROLE_CREATE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN:  ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'],
  CLINIC_ADMIN: ['DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'],
};

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create a new user account (SUPER_ADMIN or CLINIC_ADMIN only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, role, clinicId]
 *             properties:
 *               fullName:  { type: string }
 *               email:     { type: string, format: email }
 *               password:  { type: string, minLength: 8 }
 *               role:      { type: string, enum: [SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE, ASSISTANT, READ_ONLY] }
 *               clinicId:  { type: string }
 *     responses:
 *       201:
 *         description: User created — tokens returned
 *       409:
 *         description: Email already in use
 *       403:
 *         description: Insufficient permissions to create this role
 */
router.post('/register', authenticate, validateRequest({ body: registerSchema }), async (req: RegisterReq, res: Response) => {
  const callerRole = req.user!.role as string;
  const allowed = ROLE_CREATE_PERMISSIONS[callerRole] ?? [];
  if (!allowed.includes(req.body.role)) {
    return res.status(403).json({ error: 'Forbidden', message: `A ${callerRole} cannot create a ${req.body.role} account` });
  }

  const existing = await UserModel.findOne({ email: req.body.email.toLowerCase().trim() });
  if (existing) return res.status(409).json({ error: 'Conflict', message: 'Email already in use' });

  const user = await UserModel.create({
    fullName: req.body.fullName,
    email:    req.body.email.toLowerCase().trim(),
    password: req.body.password,   // hashed by pre-save hook
    role:     req.body.role,
    clinicId: req.body.clinicId,
  });

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  const accessToken  = signAccessToken(p);
  const refreshToken = signRefreshToken(p);

  await UserModel.findByIdAndUpdate(user.id, { refreshTokenHash: hashToken(refreshToken) });

  return res.status(201).json({ status: 'success', data: { accessToken, refreshToken } });
});

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
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account temporarily locked
 */
router.post('/login', validateRequest({ body: loginSchema }), async (req: LoginReq, res: Response) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase().trim() });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: INVALID });

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    res.set('Retry-After', String(retryAfterSecs));
    return res.status(423).json({
      error: 'AccountLocked',
      message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
      retryAfter: retryAfterSecs,
    });
  }

  const passwordValid = await bcrypt.compare(req.body.password, user.password);
  if (!passwordValid) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await user.save();
    return res.status(401).json({ error: 'Unauthorized', message: INVALID });
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
  }

  if (user.mfaEnabled) {
    return res.json({ status: 'mfa_required', data: { mfaRequired: true, tempToken: signTempToken(user.id) } });
  }

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  const accessToken  = signAccessToken(p);
  const refreshToken = signRefreshToken(p);

  // Store hashed refresh token
  await UserModel.findByIdAndUpdate(user.id, { refreshTokenHash: hashToken(refreshToken) });

  return res.json({ status: 'success', data: { accessToken, refreshToken } });
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token and issue new access + refresh tokens
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
 *         description: New tokens issued
 *       401:
 *         description: Invalid, expired, or already-rotated refresh token
 */
router.post('/refresh', validateRequest({ body: refreshSchema }), async (req: RefreshReq, res: Response) => {
  const decoded = verifyRefreshToken(req.body.refreshToken);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  const user = await UserModel.findById(decoded.userId).select('+refreshTokenHash');
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  const incomingHash = hashToken(req.body.refreshToken);

  // Token reuse detected — possible theft: invalidate all tokens
  if (!user.refreshTokenHash || user.refreshTokenHash !== incomingHash) {
    await UserModel.findByIdAndUpdate(user.id, { refreshTokenHash: undefined });
    return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token reuse detected' });
  }

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  const accessToken  = signAccessToken(p);
  const refreshToken = signRefreshToken(p);

  // Rotate: store new hash, invalidate old
  await UserModel.findByIdAndUpdate(user.id, { refreshTokenHash: hashToken(refreshToken) });

  return res.json({ status: 'success', data: { accessToken, refreshToken } });
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Invalidate the current refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await UserModel.findByIdAndUpdate(req.user!.userId, { refreshTokenHash: undefined });
  return res.json({ status: 'success', data: { loggedOut: true } });
});

/**
 * @swagger
 * /auth/mfa/setup:
 *   post:
 *     summary: Generate a TOTP secret and QR code URI for MFA setup
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('+mfaSecret');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { generateSecret, generateURI } = await import('@otplib/core');
  const qrcode = await import('qrcode');

  const secret = generateSecret();
  user.mfaSecret = secret;
  await user.save();

  const otpauthUrl = generateURI({ label: user.email, issuer: 'Health Watchers', secret });
  const qrCodeDataUrl = await qrcode.default.toDataURL(otpauthUrl);

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
 */
router.post('/mfa/verify', authenticate, validateRequest({ body: mfaVerifySchema }), async (req: Request<Record<string, never>, unknown, MfaVerifyDto>, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select('+mfaSecret');
  if (!user || !user.mfaSecret) return res.status(401).json({ error: 'Unauthorized', message: 'MFA setup not initiated' });

  const { totp } = await import('@otplib/preset-default');
  const valid = totp.verify({ token: req.body.totp, secret: user.mfaSecret });
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
 */
router.post('/mfa/challenge', validateRequest({ body: mfaChallengeSchema }), async (req: Request<Record<string, never>, unknown, MfaChallengeDto>, res: Response) => {
  const userId = verifyTempToken(req.body.tempToken);
  if (!userId) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired temp token' });

  const user = await UserModel.findById(userId).select('+mfaSecret');
  if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid session' });

  const { totp } = await import('@otplib/preset-default');
  const valid = totp.verify({ token: req.body.totp, secret: user.mfaSecret });
  if (!valid) return res.status(400).json({ error: 'InvalidCode', message: 'Invalid TOTP code' });

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  const accessToken  = signAccessToken(p);
  const refreshToken = signRefreshToken(p);

  await UserModel.findByIdAndUpdate(user.id, { refreshTokenHash: hashToken(refreshToken) });

  return res.json({ status: 'success', data: { accessToken, refreshToken } });
});

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
  user.lockedUntil = undefined;
  await user.save();

  return res.json({ status: 'success', data: { unlocked: true, email: user.email } });
});

// POST /auth/register
router.post('/register', validateRequest({ body: registerSchema }), async (req: Request<Record<string, never>, unknown, RegisterDto>, res: Response) => {
  const { fullName, email, password, role, clinicId } = req.body;

  const clinic = await ClinicModel.findById(clinicId);
  if (!clinic || !clinic.isActive) {
    return res.status(404).json({ error: 'ClinicNotFound', message: 'Clinic not found' });
  }

  const existing = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (existing) return res.status(409).json({ error: 'Conflict', message: 'Email already registered' });

  const user = await UserModel.create({ fullName, email, password, role, clinicId });
  return res.status(201).json({ status: 'success', data: { id: user.id, email: user.email, role: user.role } });
});

/**
 * @swagger
 * /auth/me/password:
 *   patch:
 *     summary: Change the authenticated user's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *               confirmPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Validation error or passwords do not match
 *       401:
 *         description: Unauthorized or current password incorrect
 */
router.patch('/me/password', authenticate, validateRequest({ body: changePasswordSchema }), async (req: ChangePasswordReq, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  const user = await UserModel.findById(req.user!.userId).select('+password +refreshTokenHash');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'BadRequest', message: 'Passwords do not match' });
  }

  user.password = newPassword; // pre-save hook will bcrypt-hash this
  user.refreshTokenHash = undefined;
  await user.save();

  return res.status(200).json({ status: 'success', data: { message: 'Password updated successfully' } });
});

export const authRoutes = router;
