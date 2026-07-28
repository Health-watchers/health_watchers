import jwt from 'jsonwebtoken';
import {
  validateJwtClaims,
  validateAccessTokenClaims,
  validateRefreshTokenClaims,
} from './jwt-claim-validator';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      tempTokenSecret: 'test-temp-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
  },
}));

const SECRET = 'test-access-secret-32-chars-long!!';
const ISSUER = 'health-watchers-api';
const AUDIENCE = 'health-watchers-client';

function makeToken(payload: object, secret = SECRET, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, secret, {
    expiresIn: '15m',
    issuer: ISSUER,
    audience: AUDIENCE,
    ...options,
  });
}

describe('validateJwtClaims', () => {
  const basePayload = { userId: 'user-1', role: 'DOCTOR', clinicId: 'clinic-1' };

  describe('valid token', () => {
    it('returns valid=true with payload for a correctly signed token', () => {
      const token = makeToken(basePayload);
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toMatchObject(basePayload);
    });
  });

  describe('issuer (iss) validation', () => {
    it('returns MISSING_ISSUER when token has no iss claim', () => {
      const token = jwt.sign(basePayload, SECRET, {
        expiresIn: '15m',
        audience: AUDIENCE,
      });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING_ISSUER');
    });

    it('returns INVALID_ISSUER when token iss does not match expected issuer', () => {
      const token = makeToken(basePayload, SECRET, { issuer: 'rogue-service' });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_ISSUER');
    });

    it('rejects tokens from other services even when they share the same secret', () => {
      const token = makeToken(
        { userId: 'attacker', role: 'SUPER_ADMIN', clinicId: 'any' },
        SECRET,
        { issuer: 'other-service' }
      );
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_ISSUER');
    });
  });

  describe('audience (aud) validation', () => {
    it('returns MISSING_AUDIENCE when token has no aud claim', () => {
      const token = jwt.sign(basePayload, SECRET, {
        expiresIn: '15m',
        issuer: ISSUER,
      });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING_AUDIENCE');
    });

    it('returns INVALID_AUDIENCE when token aud does not match expected audience', () => {
      const token = makeToken(basePayload, SECRET, { audience: 'wrong-client' });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_AUDIENCE');
    });

    it('rejects tokens with multiple audiences when the expected one is absent', () => {
      const token = jwt.sign(basePayload, SECRET, {
        expiresIn: '15m',
        issuer: ISSUER,
        audience: ['other-client-a', 'other-client-b'],
      });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_AUDIENCE');
    });
  });

  describe('expiry (exp) validation', () => {
    it('returns MISSING_EXPIRY when token has no exp claim', () => {
      const token = jwt.sign(basePayload, SECRET, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING_EXPIRY');
    });

    it('returns TOKEN_EXPIRED for tokens whose exp is in the past', () => {
      const token = makeToken(basePayload, SECRET, { expiresIn: '-1s' });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });
  });

  describe('signature verification', () => {
    it('returns INVALID_SIGNATURE when signature is tampered', () => {
      const token = makeToken(basePayload);
      const tampered = token.slice(0, -10) + 'AAAAAAAAAA';
      const result = validateJwtClaims(tampered, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_SIGNATURE');
    });

    it('returns INVALID_SIGNATURE when a different secret is used', () => {
      const token = jwt.sign(basePayload, 'some-other-secret', {
        expiresIn: '15m',
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_SIGNATURE');
    });
  });

  describe('malformed token', () => {
    it('returns MALFORMED_TOKEN for a completely invalid token string', () => {
      const result = validateJwtClaims('not.a.jwt', SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MALFORMED_TOKEN');
    });

    it('returns MALFORMED_TOKEN for an empty string', () => {
      const result = validateJwtClaims('', SECRET, ISSUER, AUDIENCE);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MALFORMED_TOKEN');
    });
  });

  describe('claim priority order', () => {
    it('reports MISSING_ISSUER before MISSING_AUDIENCE when both are absent', () => {
      const token = jwt.sign(basePayload, SECRET, { expiresIn: '15m' });
      const result = validateJwtClaims(token, SECRET, ISSUER, AUDIENCE);
      expect(result.error).toBe('MISSING_ISSUER');
    });
  });
});

describe('validateAccessTokenClaims', () => {
  it('validates a correctly minted access token', () => {
    const token = jwt.sign(
      { userId: 'u1', role: 'NURSE', clinicId: 'c1', jti: 'abc' },
      'test-access-secret-32-chars-long!!',
      { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const result = validateAccessTokenClaims(token);
    expect(result.valid).toBe(true);
  });

  it('rejects an access token signed with the refresh secret', () => {
    const token = jwt.sign(
      { userId: 'u1', role: 'NURSE', clinicId: 'c1', jti: 'abc' },
      'test-refresh-secret-32-chars-long!',
      { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const result = validateAccessTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE');
  });
});

describe('validateRefreshTokenClaims', () => {
  it('validates a correctly minted refresh token', () => {
    const token = jwt.sign(
      { userId: 'u1', role: 'NURSE', clinicId: 'c1', jti: 'xyz', family: 'fam1' },
      'test-refresh-secret-32-chars-long!',
      { expiresIn: '7d', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const result = validateRefreshTokenClaims(token);
    expect(result.valid).toBe(true);
  });

  it('rejects a refresh token signed with the access secret', () => {
    const token = jwt.sign(
      { userId: 'u1', role: 'NURSE', clinicId: 'c1', jti: 'xyz', family: 'fam1' },
      'test-access-secret-32-chars-long!!',
      { expiresIn: '7d', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const result = validateRefreshTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_SIGNATURE');
  });
});
