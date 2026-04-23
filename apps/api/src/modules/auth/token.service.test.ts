import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyTempToken,
  TokenPayload,
} from './token.service';

// Mock the config module
jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
  },
}));

describe('Token Service', () => {
  const mockPayload: TokenPayload = {
    userId: 'user123',
    role: 'DOCTOR',
    clinicId: 'clinic456',
  };

  describe('signAccessToken', () => {
    it('should sign a token with issuer and audience claims', () => {
      const token = signAccessToken(mockPayload);
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded).toBeTruthy();
      expect(decoded?.payload).toMatchObject({
        userId: mockPayload.userId,
        role: mockPayload.role,
        clinicId: mockPayload.clinicId,
        iss: 'health-watchers-api',
        aud: 'health-watchers-client',
      });
    });
  });

  describe('signRefreshToken', () => {
    it('should sign a refresh token with issuer, audience, jti, and family claims', () => {
      const { token, jti, family } = signRefreshToken(mockPayload);
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded).toBeTruthy();
      expect(decoded?.payload).toMatchObject({
        userId: mockPayload.userId,
        role: mockPayload.role,
        clinicId: mockPayload.clinicId,
        iss: 'health-watchers-api',
        aud: 'health-watchers-client',
        jti,
        family,
      });
    });
  });

  describe('signTempToken', () => {
    it('should sign a temp token with issuer and audience claims', () => {
      const token = signTempToken('user123');
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded).toBeTruthy();
      expect(decoded?.payload).toMatchObject({
        userId: 'user123',
        iss: 'health-watchers-api',
        aud: 'health-watchers-client',
      });
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = signAccessToken(mockPayload);
      const result = verifyAccessToken(token);

      expect(result).toEqual(mockPayload);
    });

    it('should reject a token without issuer claim', () => {
      const tokenWithoutIssuer = jwt.sign(
        mockPayload,
        'test-access-secret',
        { expiresIn: '15m', audience: 'health-watchers-client' }
      );

      const result = verifyAccessToken(tokenWithoutIssuer);
      expect(result).toBeNull();
    });

    it('should reject a token with wrong issuer', () => {
      const tokenWithWrongIssuer = jwt.sign(
        mockPayload,
        'test-access-secret',
        {
          expiresIn: '15m',
          issuer: 'malicious-service',
          audience: 'health-watchers-client',
        }
      );

      const result = verifyAccessToken(tokenWithWrongIssuer);
      expect(result).toBeNull();
    });

    it('should reject a token without audience claim', () => {
      const tokenWithoutAudience = jwt.sign(
        mockPayload,
        'test-access-secret',
        { expiresIn: '15m', issuer: 'health-watchers-api' }
      );

      const result = verifyAccessToken(tokenWithoutAudience);
      expect(result).toBeNull();
    });

    it('should reject a token with wrong audience', () => {
      const tokenWithWrongAudience = jwt.sign(
        mockPayload,
        'test-access-secret',
        {
          expiresIn: '15m',
          issuer: 'health-watchers-api',
          audience: 'wrong-audience',
        }
      );

      const result = verifyAccessToken(tokenWithWrongAudience);
      expect(result).toBeNull();
    });

    it('should reject a token with correct secret but wrong issuer and audience', () => {
      const maliciousToken = jwt.sign(
        mockPayload,
        'test-access-secret',
        {
          expiresIn: '15m',
          issuer: 'other-service',
          audience: 'other-client',
        }
      );

      const result = verifyAccessToken(maliciousToken);
      expect(result).toBeNull();
    });

    it('should reject an expired token', () => {
      const expiredToken = jwt.sign(
        mockPayload,
        'test-access-secret',
        {
          expiresIn: '-1s',
          issuer: 'health-watchers-api',
          audience: 'health-watchers-client',
        }
      );

      const result = verifyAccessToken(expiredToken);
      expect(result).toBeNull();
    });

    it('should reject a token with invalid signature', () => {
      const token = signAccessToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      const result = verifyAccessToken(tamperedToken);
      expect(result).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token and return payload with jti and family', () => {
      const { token } = signRefreshToken(mockPayload);
      const result = verifyRefreshToken(token);

      expect(result).toMatchObject(mockPayload);
      expect(result?.jti).toBeDefined();
      expect(result?.family).toBeDefined();
    });

    it('should reject a token with wrong issuer', () => {
      const tokenWithWrongIssuer = jwt.sign(
        { ...mockPayload, jti: 'test-jti', family: 'test-family' },
        'test-refresh-secret',
        {
          expiresIn: '7d',
          issuer: 'malicious-service',
          audience: 'health-watchers-client',
        }
      );

      const result = verifyRefreshToken(tokenWithWrongIssuer);
      expect(result).toBeNull();
    });

    it('should reject a token with wrong audience', () => {
      const tokenWithWrongAudience = jwt.sign(
        { ...mockPayload, jti: 'test-jti', family: 'test-family' },
        'test-refresh-secret',
        {
          expiresIn: '7d',
          issuer: 'health-watchers-api',
          audience: 'wrong-audience',
        }
      );

      const result = verifyRefreshToken(tokenWithWrongAudience);
      expect(result).toBeNull();
    });
  });

  describe('verifyTempToken', () => {
    it('should verify a valid temp token', () => {
      const token = signTempToken('user123');
      const result = verifyTempToken(token);

      expect(result).toBe('user123');
    });

    it('should reject a token with wrong issuer', () => {
      const tokenWithWrongIssuer = jwt.sign(
        { userId: 'user123' },
        'test-access-secret',
        {
          expiresIn: '5m',
          issuer: 'malicious-service',
          audience: 'health-watchers-client',
        }
      );

      const result = verifyTempToken(tokenWithWrongIssuer);
      expect(result).toBeNull();
    });

    it('should reject a token with wrong audience', () => {
      const tokenWithWrongAudience = jwt.sign(
        { userId: 'user123' },
        'test-access-secret',
        {
          expiresIn: '5m',
          issuer: 'health-watchers-api',
          audience: 'wrong-audience',
        }
      );

      const result = verifyTempToken(tokenWithWrongAudience);
      expect(result).toBeNull();
    });
  });

  describe('Token Confusion Attack Prevention', () => {
    it('should prevent token confusion between services with same secret', () => {
      // Simulate another service using the same secret but different issuer
      const otherServiceToken = jwt.sign(
        { userId: 'user123', role: 'ADMIN', clinicId: 'clinic789' },
        'test-access-secret',
        {
          expiresIn: '15m',
          issuer: 'other-service-api',
          audience: 'other-service-client',
        }
      );

      // This token should be rejected even though it has the correct secret
      const result = verifyAccessToken(otherServiceToken);
      expect(result).toBeNull();
    });

    it('should prevent token confusion with missing claims', () => {
      // Token signed without iss and aud claims
      const tokenWithoutClaims = jwt.sign(
        mockPayload,
        'test-access-secret',
        { expiresIn: '15m' }
      );

      const result = verifyAccessToken(tokenWithoutClaims);
      expect(result).toBeNull();
    });
  });
});
