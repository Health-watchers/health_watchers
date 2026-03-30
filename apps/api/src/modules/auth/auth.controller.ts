import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { validateRequest } from "@api/middlewares/validate.middleware";
import { authenticate } from "@api/middlewares/auth.middleware";
import {
  LoginDto,
  RefreshDto,
  loginSchema,
  refreshSchema,
} from "./auth.validation";
import { UserModel } from "./models/user.model";
import {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyRefreshToken,
  verifyTempToken,
} from "./token.service";

const router = Router();
const INVALID = "Invalid email or password";
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

  // Validate that the clinic exists
  const clinic = await ClinicModel.findById(req.body.clinicId);
  if (!clinic) {
    return res.status(400).json({ error: 'BadRequest', message: `Clinic with ID '${req.body.clinicId}' does not exist` });
  }

  const user = await UserModel.create({
    fullName: req.body.fullName,
    email:    req.body.email.toLowerCase().trim(),
    password: req.body.password,   // hashed by pre-save hook
    role:     req.body.role,
    clinicId: req.body.clinicId,
  });

  const { password: _pw, ...sanitized } = user.toObject();
  return res.status(201).json({ status: 'success', data: sanitized });
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
router.post(
  "/login",
  validateRequest({ body: loginSchema }),
  async (req: LoginReq, res: Response) => {
    const user = await UserModel.findOne({
      email: req.body.email.toLowerCase().trim(),
    });
    if (!user || !user.isActive)
      return res.status(401).json({ error: "Unauthorized", message: INVALID });

    // --- account lockout check ---
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSecs = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      );
      res.set("Retry-After", String(retryAfterSecs));
      return res.status(423).json({
        error: "AccountLocked",
        message:
          "Account is temporarily locked due to too many failed login attempts. Please try again later.",
        retryAfter: retryAfterSecs,
      });
    }

    // --- password check ---
    const passwordValid = await bcrypt.compare(
      req.body.password,
      user.password,
    );
    if (!passwordValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }

      await user.save();
      return res.status(401).json({ error: "Unauthorized", message: INVALID });
    }

    // --- successful login: reset lockout counters ---
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      await user.save();
    }

    if (user.mfaEnabled) {
      return res.json({
        status: "mfa_required",
        data: { mfaRequired: true, tempToken: signTempToken(user.id) },
      });
    }

    const p = {
      userId: user.id,
      role: user.role,
      clinicId: String(user.clinicId),
    };
    return res.json({
      status: "success",
      data: {
        accessToken: signAccessToken(p),
        refreshToken: signRefreshToken(p),
      },
    });
  },
);

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
router.post(
  "/refresh",
  validateRequest({ body: refreshSchema }),
  async (req: RefreshReq, res: Response) => {
    const decoded = verifyRefreshToken(req.body.refreshToken);
    if (!decoded)
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid refresh token" });
    const user = await UserModel.findById(decoded.userId);
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid refresh token" });
    return res.json({
      status: "success",
      data: {
        accessToken: signAccessToken({
          userId: user.id,
          role: user.role,
          clinicId: String(user.clinicId),
        }),
      },
    });
  },
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Invalidate the current refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
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
router.post("/mfa/setup", authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId).select("+mfaSecret");
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { generateSecret, generateURI } = await import('@otplib/core');
  const qrcode = await import('qrcode');

  const secret = generateSecret();
  user.mfaSecret = secret;
  await user.save();

  const otpauthUrl = generateURI({
    label: user.email,
    issuer: "Health Watchers",
    secret,
  });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  return res.json({ status: "success", data: { otpauthUrl, qrCodeDataUrl } });
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
router.post(
  "/mfa/verify",
  authenticate,
  validateRequest({ body: mfaVerifySchema }),
  async (
    req: Request<Record<string, never>, unknown, MfaVerifyDto>,
    res: Response,
  ) => {
    const user = await UserModel.findById(req.user!.userId).select(
      "+mfaSecret",
    );
    if (!user || !user.mfaSecret)
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "MFA setup not initiated" });

    const result = await totpVerify({
      token: req.body.totp,
      secret: user.mfaSecret!,
    });
    const valid = result.valid;
    if (!valid)
      return res
        .status(400)
        .json({ error: "InvalidCode", message: "Invalid TOTP code" });

    user.mfaEnabled = true;
    await user.save();

    return res.json({ status: "success", data: { mfaEnabled: true } });
  },
);

/**
 * @swagger
 * /auth/mfa/challenge:
 *   post:
 *     summary: Complete MFA login — exchange temp token + TOTP for real tokens
 *     tags: [Auth]
 */
router.post(
  "/mfa/challenge",
  validateRequest({ body: mfaChallengeSchema }),
  async (
    req: Request<Record<string, never>, unknown, MfaChallengeDto>,
    res: Response,
  ) => {
    const userId = verifyTempToken(req.body.tempToken);
    if (!userId)
      return res
        .status(401)
        .json({
          error: "Unauthorized",
          message: "Invalid or expired temp token",
        });

    const user = await UserModel.findById(userId).select("+mfaSecret");
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret)
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid session" });

    const result = await totpVerify({
      token: req.body.totp,
      secret: user.mfaSecret!,
    });
    const valid = result.valid;
    if (!valid)
      return res
        .status(400)
        .json({ error: "InvalidCode", message: "Invalid TOTP code" });

    const p = {
      userId: user.id,
      role: user.role,
      clinicId: String(user.clinicId),
    };
    return res.json({
      status: "success",
      data: {
        accessToken: signAccessToken(p),
        refreshToken: signRefreshToken(p),
      },
    });
  },
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
router.post("/unlock", authenticate, async (req: Request, res: Response) => {
  if (req.user!.role !== "SUPER_ADMIN")
    return res
      .status(403)
      .json({ error: "Forbidden", message: "SUPER_ADMIN role required" });

  const { email } = req.body as { email?: string };
  if (!email)
    return res
      .status(400)
      .json({ error: "BadRequest", message: "email is required" });

  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (!user)
    return res
      .status(404)
      .json({ error: "NotFound", message: "User not found" });

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  return res.json({
    status: "success",
    data: { unlocked: true, email: user.email },
  });
});

export const authRoutes = router;
