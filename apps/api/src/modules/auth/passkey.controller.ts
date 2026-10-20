/**
 * Passkey (WebAuthn) routes for staff — issue #1496
 *
 * Mounted at /api/v1/auth/passkeys.
 *
 *   POST   /register/options   — begin registering a passkey (authenticated)
 *   POST   /register/verify    — finish registration, store the credential
 *   GET    /                   — list the caller's passkeys
 *   PATCH  /:id                — rename a passkey
 *   DELETE /:id                — remove a passkey
 *   POST   /login/options      — begin sign-in (usernameless, or 2nd factor with tempToken)
 *   POST   /login/verify       — finish sign-in and issue tokens
 */
import { Request, Response, Router } from 'express';
import { isValidObjectId } from 'mongoose';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { UserModel } from './models/user.model';
import { PasskeyModel } from './models/passkey.model';
import { RefreshTokenModel } from './models/refresh-token.model';
import {
  REFRESH_TOKEN_EXPIRY_MS,
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyTempToken,
} from './token.service';
import {
  MAX_PASSKEYS_PER_USER,
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './services/passkey.service';
import { MFA_REQUIRED_ROLES, PASSKEY_MFA_ROLES, generateBackupCodes } from './mfa-policy';
import {
  PasskeyLoginOptionsDto,
  PasskeyLoginVerifyDto,
  PasskeyRegisterVerifyDto,
  PasskeyRenameDto,
  passkeyLoginOptionsSchema,
  passkeyLoginVerifySchema,
  passkeyRegisterVerifySchema,
  passkeyRenameSchema,
} from './passkey.validation';
import { auditLog } from '../audit/audit.service';

const router = Router();

function toPasskeyResponse(p: {
  _id: unknown;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt?: Date;
  lastUsedAt?: Date;
}) {
  return {
    id: String(p._id),
    name: p.name,
    deviceType: p.deviceType,
    backedUp: p.backedUp,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt ?? null,
  };
}

async function issueTokens(user: { _id: unknown; role: string; clinicId: unknown }) {
  const userId = String(user._id);
  const p = {
    userId,
    role: user.role,
    clinicId: String(user.clinicId),
    isSuperAdmin: user.role === 'SUPER_ADMIN',
  };
  const { token: refreshToken, jti, family } = signRefreshToken(p);
  await RefreshTokenModel.create({
    jti,
    userId,
    family,
    consumed: false,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });
  return { accessToken: signAccessToken(p), refreshToken };
}

// ── Registration ─────────────────────────────────────────────────────────────

router.post('/register/options', authenticate, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });

  if ((user.passkeyCount ?? 0) >= MAX_PASSKEYS_PER_USER) {
    return res.status(409).json({
      error: 'Conflict',
      message: `You can register at most ${MAX_PASSKEYS_PER_USER} passkeys.`,
    });
  }

  const { challengeId, options } = await createRegistrationOptions({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
  });
  return res.json({ status: 'success', data: { challengeId, options } });
});

router.post(
  '/register/verify',
  authenticate,
  validateRequest({ body: passkeyRegisterVerifySchema }),
  async (req: Request<Record<string, never>, unknown, PasskeyRegisterVerifyDto>, res: Response) => {
    const user = await UserModel.findById(req.user!.userId).select('+mfaBackupCodes');
    if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });

    const passkey = await verifyRegistration({
      userId: user.id,
      challengeId: req.body.challengeId,
      response: req.body.response as unknown as RegistrationResponseJSON,
      name: req.body.name ?? `Passkey ${(user.passkeyCount ?? 0) + 1}`,
    });
    if (!passkey) {
      return res
        .status(400)
        .json({ error: 'InvalidPasskey', message: 'Passkey registration could not be verified' });
    }

    user.passkeyCount = await PasskeyModel.countDocuments({ userId: user.id });

    // Backup codes stay the recovery path — issue a set if the user has none yet
    let backupCodes: string[] | undefined;
    if (!user.mfaBackupCodes || user.mfaBackupCodes.length === 0) {
      const { plain, hashed } = generateBackupCodes();
      user.mfaBackupCodes = hashed;
      backupCodes = plain;
    }
    await user.save();

    await auditLog(
      {
        action: 'LOGIN_SUCCESS',
        userId: user.id,
        clinicId: String(user.clinicId),
        metadata: { event: 'passkey_registered', passkeyId: String(passkey._id) },
      },
      req
    );

    return res.status(201).json({
      status: 'success',
      data: { passkey: toPasskeyResponse(passkey), ...(backupCodes ? { backupCodes } : {}) },
    });
  }
);

// ── Management ───────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  const passkeys = await PasskeyModel.find({ userId: req.user!.userId })
    .sort({ createdAt: 1 })
    .lean();
  return res.json({ status: 'success', data: passkeys.map(toPasskeyResponse) });
});

router.patch(
  '/:id',
  authenticate,
  validateRequest({ body: passkeyRenameSchema }),
  async (req: Request<{ id: string }, unknown, PasskeyRenameDto>, res: Response) => {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid passkey ID' });
    }
    const passkey = await PasskeyModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      { name: req.body.name },
      { new: true, runValidators: true }
    ).lean();
    if (!passkey) return res.status(404).json({ error: 'NotFound', message: 'Passkey not found' });
    return res.json({ status: 'success', data: toPasskeyResponse(passkey) });
  }
);

router.delete('/:id', authenticate, async (req: Request<{ id: string }>, res: Response) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'BadRequest', message: 'Invalid passkey ID' });
  }
  const user = await UserModel.findById(req.user!.userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const deleted = await PasskeyModel.findOneAndDelete({ _id: req.params.id, userId: user.id });
  if (!deleted) return res.status(404).json({ error: 'NotFound', message: 'Passkey not found' });

  user.passkeyCount = await PasskeyModel.countDocuments({ userId: user.id });
  await user.save();

  await auditLog(
    {
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      clinicId: String(user.clinicId),
      metadata: { event: 'passkey_removed', passkeyId: req.params.id },
    },
    req
  );

  return res.json({ status: 'success', data: { id: req.params.id, deleted: true } });
});

// ── Authentication ───────────────────────────────────────────────────────────

router.post(
  '/login/options',
  validateRequest({ body: passkeyLoginOptionsSchema }),
  async (req: Request<Record<string, never>, unknown, PasskeyLoginOptionsDto>, res: Response) => {
    let userId: string | undefined;
    if (req.body.tempToken) {
      const fromToken = verifyTempToken(req.body.tempToken);
      if (!fromToken) {
        return res
          .status(401)
          .json({ error: 'Unauthorized', message: 'Invalid or expired temp token' });
      }
      userId = fromToken;
    }

    const { challengeId, options } = await createAuthenticationOptions(userId);
    return res.json({ status: 'success', data: { challengeId, options } });
  }
);

router.post(
  '/login/verify',
  validateRequest({ body: passkeyLoginVerifySchema }),
  async (req: Request<Record<string, never>, unknown, PasskeyLoginVerifyDto>, res: Response) => {
    const expectedUserId = req.body.tempToken ? verifyTempToken(req.body.tempToken) : undefined;
    if (req.body.tempToken && !expectedUserId) {
      return res
        .status(401)
        .json({ error: 'Unauthorized', message: 'Invalid or expired temp token' });
    }

    const result = await verifyAuthentication({
      challengeId: req.body.challengeId,
      response: req.body.response as unknown as AuthenticationResponseJSON,
    });
    if (!result || (expectedUserId && result.userId !== expectedUserId)) {
      return res
        .status(401)
        .json({ error: 'Unauthorized', message: 'Passkey could not be verified' });
    }

    const user = await UserModel.findById(result.userId);
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ error: 'Unauthorized', message: 'Passkey could not be verified' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      res.set('Retry-After', String(retryAfterSecs));
      return res.status(423).json({
        error: 'AccountLocked',
        message: 'Account is temporarily locked.',
        retryAfter: retryAfterSecs,
      });
    }

    // A user-verified passkey satisfies MFA for PASSKEY_MFA_ROLES. Other roles that
    // must use MFA still complete their TOTP challenge after the passkey sign-in.
    if (!PASSKEY_MFA_ROLES.has(user.role)) {
      if (user.mfaEnabled && !expectedUserId) {
        return res.json({
          status: 'mfa_required',
          data: {
            mfaRequired: true,
            tempToken: signTempToken(user.id),
            methods: ['totp', 'backup_code'],
          },
        });
      }
      if (MFA_REQUIRED_ROLES.has(user.role) && !user.mfaEnabled) {
        return res.status(403).json({
          error: 'MfaRequired',
          message: 'Sign in with your password to finish setting up 2FA for your role.',
        });
      }
    }

    await auditLog(
      {
        action: 'LOGIN_SUCCESS',
        userId: user.id,
        clinicId: String(user.clinicId),
        metadata: { method: 'passkey', passkeyId: result.passkeyId },
      },
      req
    );

    return res.json({ status: 'success', data: await issueTokens(user) });
  }
);

export const passkeyRoutes = router;
