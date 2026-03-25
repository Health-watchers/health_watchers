import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  TokenUser,
} from '../../modules/auth/token.service';

const user: TokenUser = {
  userId:   'user-123',
  role:     'DOCTOR',
  clinicId: 'clinic-456',
};

describe('token.service', () => {
  // ─── signAccessToken ────────────────────────────────────────────────────────
  describe('signAccessToken', () => {
    it('returns a non-empty JWT string', () => {
      const token = signAccessToken(user);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('embeds correct payload fields', () => {
      const token = signAccessToken(user);
      const decoded = jwt.decode(token) as Record<string, unknown>;
      expect(decoded.userId).toBe(user.userId);
      expect(decoded.role).toBe(user.role);
      expect(decoded.clinicId).toBe(user.clinicId);
      expect(decoded.tokenType).toBe('access');
    });

    it('expires in ~15 minutes', () => {
      const before = Math.floor(Date.now() / 1000);
      const token  = signAccessToken(user);
      const decoded = jwt.decode(token) as Record<string, number>;
      expect(decoded.exp - decoded.iat).toBe(15 * 60);
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── signRefreshToken ───────────────────────────────────────────────────────
  describe('signRefreshToken', () => {
    it('returns a non-empty JWT string', () => {
      const token = signRefreshToken(user);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('embeds tokenType "refresh"', () => {
      const token   = signRefreshToken(user);
      const decoded = jwt.decode(token) as Record<string, unknown>;
      expect(decoded.tokenType).toBe('refresh');
    });

    it('expires in ~7 days', () => {
      const token   = signRefreshToken(user);
      const decoded = jwt.decode(token) as Record<string, number>;
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    });
  });

  // ─── verifyAccessToken ──────────────────────────────────────────────────────
  describe('verifyAccessToken', () => {
    it('returns AuthenticatedUser for a valid access token', () => {
      const token  = signAccessToken(user);
      const result = verifyAccessToken(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(user.userId);
      expect(result!.role).toBe(user.role);
      expect(result!.clinicId).toBe(user.clinicId);
    });

    it('returns null for a refresh token passed as access token', () => {
      const refresh = signRefreshToken(user);
      expect(verifyAccessToken(refresh)).toBeNull();
    });

    it('returns null for a tampered token', () => {
      const token   = signAccessToken(user);
      const tampered = token.slice(0, -4) + 'xxxx';
      expect(verifyAccessToken(tampered)).toBeNull();
    });

    it('returns null for a completely invalid string', () => {
      expect(verifyAccessToken('not.a.token')).toBeNull();
    });

    it('returns null for an expired token', () => {
      const expired = jwt.sign(
        { ...user, tokenType: 'access' },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: -1 },
      );
      expect(verifyAccessToken(expired)).toBeNull();
    });
  });

  // ─── verifyRefreshToken ─────────────────────────────────────────────────────
  describe('verifyRefreshToken', () => {
    it('returns TokenUser for a valid refresh token', () => {
      const token  = signRefreshToken(user);
      const result = verifyRefreshToken(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(user.userId);
      expect(result!.role).toBe(user.role);
      expect(result!.clinicId).toBe(user.clinicId);
    });

    it('returns null for an access token passed as refresh token', () => {
      const access = signAccessToken(user);
      expect(verifyRefreshToken(access)).toBeNull();
    });

    it('returns null for a tampered token', () => {
      const token   = signRefreshToken(user);
      const tampered = token.slice(0, -4) + 'xxxx';
      expect(verifyRefreshToken(tampered)).toBeNull();
    });

    it('returns null for an expired refresh token', () => {
      const expired = jwt.sign(
        { ...user, tokenType: 'refresh' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: -1 },
      );
      expect(verifyRefreshToken(expired)).toBeNull();
    });
  });
});
