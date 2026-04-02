# JWT Security Update: Issuer and Audience Claims

## Overview
This update addresses a token confusion attack vector by adding `issuer` (iss) and `audience` (aud) claims to all JWT tokens.

## Problem
Previously, JWTs were signed without issuer or audience claims. If another service in the same infrastructure used JWTs signed with the same secret, tokens from that service could be accepted by this API, creating a token confusion attack vector.

## Solution
All JWT signing and verification now includes:
- `issuer: 'health-watchers-api'` - Identifies this API as the token issuer
- `audience: 'health-watchers-client'` - Identifies the intended recipient

## Changes Made

### 1. Created `token.service.ts`
New service module that handles all JWT operations:
- `signAccessToken()` - Signs access tokens with iss/aud claims
- `signRefreshToken()` - Signs refresh tokens with iss/aud claims
- `signTempToken()` - Signs temporary MFA tokens with iss/aud claims
- `verifyAccessToken()` - Verifies access tokens and validates iss/aud
- `verifyRefreshToken()` - Verifies refresh tokens and validates iss/aud
- `verifyTempToken()` - Verifies temp tokens and validates iss/aud

### 2. Updated Configuration
**`packages/config/index.ts`**
- Added `jwt.issuer` configuration (default: 'health-watchers-api')
- Added `jwt.audience` configuration (default: 'health-watchers-client')

**`.env.example`**
- Added `JWT_ISSUER=health-watchers-api`
- Added `JWT_AUDIENCE=health-watchers-client`

### 3. Created Comprehensive Tests
**`token.service.test.ts`** includes tests for:
- ✅ Tokens are signed with correct iss and aud claims
- ✅ Tokens without issuer claim are rejected
- ✅ Tokens with wrong issuer are rejected
- ✅ Tokens without audience claim are rejected
- ✅ Tokens with wrong audience are rejected
- ✅ Token confusion attacks are prevented
- ✅ Expired tokens are rejected
- ✅ Tampered tokens are rejected

## Acceptance Criteria Status

✅ **A token signed without `iss: 'health-watchers-api'` is rejected by verifyAccessToken**
- Test: "should reject a token without issuer claim"
- Test: "should reject a token with wrong issuer"

✅ **A token signed with the correct secret but wrong aud is rejected**
- Test: "should reject a token with wrong audience"
- Test: "should reject a token without audience claim"

✅ **Unit tests cover the rejection of tokens with wrong iss and aud**
- Comprehensive test suite in `token.service.test.ts`
- Tests cover all verification functions
- Tests include token confusion attack scenarios

## Environment Variables

Add these to your `.env` file:

```bash
JWT_ISSUER=health-watchers-api
JWT_AUDIENCE=health-watchers-client
```

## Running Tests

```bash
# Run all tests
npm test

# Run token service tests specifically
npm test token.service.test.ts

# Run tests in watch mode
npm test -- --watch
```

## Security Benefits

1. **Token Confusion Prevention**: Tokens from other services (even with the same secret) are rejected
2. **Explicit Trust Boundaries**: Clear identification of token issuer and intended audience
3. **Defense in Depth**: Additional layer of validation beyond signature verification
4. **Compliance**: Aligns with JWT best practices (RFC 7519)

## Migration Notes

- Existing tokens without iss/aud claims will be rejected after deployment
- Users will need to re-authenticate to receive new tokens
- Consider a grace period or token migration strategy if needed

## References

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
