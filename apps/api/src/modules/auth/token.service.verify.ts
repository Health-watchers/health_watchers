/**
 * Standalone verification script for JWT token service
 * Run with: npx ts-node -r tsconfig-paths/register apps/api/src/modules/auth/token.service.verify.ts
 */

import jwt from 'jsonwebtoken';

// Mock config for testing
const mockConfig = {
  jwt: {
    accessTokenSecret: 'test-access-secret',
    refreshTokenSecret: 'test-refresh-secret',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  },
};

// Import token service functions (inline for testing)
interface TokenPayload {
  userId: string;
  role: string;
  clinicId: string;
}

interface JwtPayload extends TokenPayload {
  iss: string;
  aud: string;
}

const JWT_ISSUER = mockConfig.jwt.issuer;
const JWT_AUDIENCE = mockConfig.jwt.audience;
const ACCESS_TOKEN_EXPIRY = '15m';

function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, mockConfig.jwt.accessTokenSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, mockConfig.jwt.accessTokenSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    return {
      userId: decoded.userId,
      role: decoded.role,
      clinicId: decoded.clinicId,
    };
  } catch (error) {
    return null;
  }
}

// Test utilities
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    failedTests++;
  }
}

function assertEqual(actual: any, expected: any, testName: string) {
  const condition = JSON.stringify(actual) === JSON.stringify(expected);
  assert(condition, testName);
  if (!condition) {
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Actual: ${JSON.stringify(actual)}`);
  }
}

// Run tests
console.log('\n🧪 Running JWT Token Service Verification Tests\n');
console.log('='.repeat(60));

const mockPayload: TokenPayload = {
  userId: 'user123',
  role: 'DOCTOR',
  clinicId: 'clinic456',
};

// Test 1: Token is signed with issuer and audience
console.log('\n📋 Test Group: Token Signing\n');
const validToken = signAccessToken(mockPayload);
const decoded = jwt.decode(validToken, { complete: true }) as any;
assert(decoded?.payload?.iss === 'health-watchers-api', 'Token includes correct issuer claim');
assert(decoded?.payload?.aud === 'health-watchers-client', 'Token includes correct audience claim');
assert(decoded?.payload?.userId === 'user123', 'Token includes userId');

// Test 2: Valid token is verified successfully
console.log('\n📋 Test Group: Valid Token Verification\n');
const verifiedPayload = verifyAccessToken(validToken);
assertEqual(verifiedPayload, mockPayload, 'Valid token is verified and returns correct payload');

// Test 3: Token without issuer is rejected
console.log('\n📋 Test Group: Issuer Validation\n');
const tokenWithoutIssuer = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, {
  expiresIn: '15m',
  audience: 'health-watchers-client',
});
const resultNoIssuer = verifyAccessToken(tokenWithoutIssuer);
assertEqual(resultNoIssuer, null, 'Token without issuer claim is REJECTED');

// Test 4: Token with wrong issuer is rejected
const tokenWithWrongIssuer = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, {
  expiresIn: '15m',
  issuer: 'malicious-service',
  audience: 'health-watchers-client',
});
const resultWrongIssuer = verifyAccessToken(tokenWithWrongIssuer);
assertEqual(resultWrongIssuer, null, 'Token with wrong issuer is REJECTED');

// Test 5: Token without audience is rejected
console.log('\n📋 Test Group: Audience Validation\n');
const tokenWithoutAudience = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, {
  expiresIn: '15m',
  issuer: 'health-watchers-api',
});
const resultNoAudience = verifyAccessToken(tokenWithoutAudience);
assertEqual(resultNoAudience, null, 'Token without audience claim is REJECTED');

// Test 6: Token with wrong audience is rejected
const tokenWithWrongAudience = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, {
  expiresIn: '15m',
  issuer: 'health-watchers-api',
  audience: 'wrong-audience',
});
const resultWrongAudience = verifyAccessToken(tokenWithWrongAudience);
assertEqual(resultWrongAudience, null, 'Token with wrong audience is REJECTED');

// Test 7: Token confusion attack prevention
console.log('\n📋 Test Group: Token Confusion Attack Prevention\n');
const otherServiceToken = jwt.sign(
  { userId: 'user123', role: 'ADMIN', clinicId: 'clinic789' },
  mockConfig.jwt.accessTokenSecret,
  {
    expiresIn: '15m',
    issuer: 'other-service-api',
    audience: 'other-service-client',
  }
);
const resultOtherService = verifyAccessToken(otherServiceToken);
assertEqual(
  resultOtherService,
  null,
  'Token from other service (same secret, different iss/aud) is REJECTED'
);

// Test 8: Token with no claims at all
const tokenNoClaims = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, { expiresIn: '15m' });
const resultNoClaims = verifyAccessToken(tokenNoClaims);
assertEqual(resultNoClaims, null, 'Token without any iss/aud claims is REJECTED');

// Test 9: Expired token is rejected
console.log('\n📋 Test Group: Additional Security Checks\n');
const expiredToken = jwt.sign(mockPayload, mockConfig.jwt.accessTokenSecret, {
  expiresIn: '-1s',
  issuer: 'health-watchers-api',
  audience: 'health-watchers-client',
});
const resultExpired = verifyAccessToken(expiredToken);
assertEqual(resultExpired, null, 'Expired token is REJECTED');

// Test 10: Tampered token is rejected
const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
const resultTampered = verifyAccessToken(tamperedToken);
assertEqual(resultTampered, null, 'Tampered token is REJECTED');

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 Test Results Summary\n');
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total:  ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All tests passed! JWT security implementation is working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
