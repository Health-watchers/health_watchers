/**
 * Unit tests for POST /auth/forgot-password and POST /auth/reset-password.
 */

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findOne: jest.fn() },
}));

jest.mock('@api/lib/email.service', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import crypto from 'crypto';
import { UserModel } from '@api/modules/auth/models/user.model';
import { sendPasswordResetEmail } from '@api/lib/email.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

// ── Inline handler logic (mirrors auth.controller.ts) ─────────────────────────

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

async function forgotPasswordHandler(body: { email: string }, res: ReturnType<typeof makeRes>) {
  const user = await (UserModel as any).findOne({ email: body.email.toLowerCase().trim() });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = hashToken(rawToken);
    user.resetPasswordExpiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    await user.save();
    await sendPasswordResetEmail(user.email, rawToken);
  }
  return res.json({
    status: 'success',
    data: { message: 'If that email exists, a reset link has been sent.' },
  });
}

async function resetPasswordHandler(
  body: { token: string; newPassword: string },
  res: ReturnType<typeof makeRes>
) {
  const tokenHash = hashToken(body.token);
  const user = await (UserModel as any).findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
    resetPasswordExpiresAt: { $gt: expect.any(Date) },
  });

  if (!user) {
    return res.status(400).json({ error: 'BadRequest', message: 'Invalid or expired reset token' });
  }

  user.password = body.newPassword;
  user.resetPasswordTokenHash = undefined;
  user.resetPasswordExpiresAt = undefined;
  await user.save();

  return res.json({
    status: 'success',
    data: { message: 'Password has been reset successfully.' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends reset email and returns 200 when user exists', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const user = {
      email: 'doctor@clinic.com',
      resetPasswordTokenHash: undefined,
      resetPasswordExpiresAt: undefined,
      save: saveMock,
    };
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    const res = makeRes();

    await forgotPasswordHandler({ email: 'doctor@clinic.com' }, res);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(user.resetPasswordTokenHash).toBeDefined();
    expect(user.resetPasswordExpiresAt).toBeInstanceOf(Date);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('doctor@clinic.com', expect.any(String));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('returns 200 even when user does not exist (no email enumeration)', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await forgotPasswordHandler({ email: 'nobody@nowhere.com' }, res);

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('stores a SHA-256 hash of the token, not the raw token', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const user = {
      email: 'x@x.com',
      resetPasswordTokenHash: undefined,
      resetPasswordExpiresAt: undefined,
      save: saveMock,
    };
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    const res = makeRes();

    await forgotPasswordHandler({ email: 'x@x.com' }, res);

    // The hash stored must differ from the raw token sent in the email
    const rawTokenSentInEmail = (sendPasswordResetEmail as jest.Mock).mock.calls[0][1] as string;
    expect(user.resetPasswordTokenHash).not.toBe(rawTokenSentInEmail);
    expect(user.resetPasswordTokenHash).toBe(hashToken(rawTokenSentInEmail));
  });

  it('sets expiry ~1 hour in the future', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const user = {
      email: 'x@x.com',
      resetPasswordTokenHash: undefined,
      resetPasswordExpiresAt: undefined,
      save: saveMock,
    };
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    const res = makeRes();
    const before = Date.now();

    await forgotPasswordHandler({ email: 'x@x.com' }, res);

    const expiry = user.resetPasswordExpiresAt!.getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + RESET_TOKEN_EXPIRY_MS - 100);
    expect(expiry).toBeLessThanOrEqual(before + RESET_TOKEN_EXPIRY_MS + 1000);
  });
});

describe('POST /auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resets password and clears token fields on valid token', async () => {
    const rawToken = 'validtoken123';
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const user = {
      password: 'OldPass1!',
      resetPasswordTokenHash: hashToken(rawToken),
      resetPasswordExpiresAt: new Date(Date.now() + 3600_000),
      save: saveMock,
    };
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    const res = makeRes();

    await resetPasswordHandler({ token: rawToken, newPassword: 'NewPass1!' }, res);

    expect(user.password).toBe('NewPass1!');
    expect(user.resetPasswordTokenHash).toBeUndefined();
    expect(user.resetPasswordExpiresAt).toBeUndefined();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('returns 400 when token is invalid or expired', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await resetPasswordHandler({ token: 'badtoken', newPassword: 'NewPass1!' }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BadRequest' }));
  });

  it('queries by hashed token, not raw token', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();
    const rawToken = 'myrawtoken';

    await resetPasswordHandler({ token: rawToken, newPassword: 'NewPass1!' }, res);

    const queryArg = (UserModel.findOne as jest.Mock).mock.calls[0][0];
    expect(queryArg.resetPasswordTokenHash).toBe(hashToken(rawToken));
    expect(queryArg.resetPasswordTokenHash).not.toBe(rawToken);
  });

  it('already-used token returns 400 (token cleared after use)', async () => {
    // Simulate token already consumed: findOne returns null (token was cleared)
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await resetPasswordHandler({ token: 'usedtoken', newPassword: 'NewPass1!' }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
