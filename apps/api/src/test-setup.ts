/**
 * Jest global setup — runs before every test file.
 *
 * Sets the minimum required environment variables so that src/config/env.ts
 * passes validation without calling process.exit(1).
 */

// These must be set before any module that imports src/config/env.ts
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET =
  process.env.JWT_ACCESS_TOKEN_SECRET || 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET =
  process.env.JWT_REFRESH_TOKEN_SECRET || 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = process.env.API_PORT || '3001';
process.env.NODE_ENV = 'test';
// Strict 64-char hex key required by src/lib/encrypt.ts (32 bytes).
process.env.FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY || 'a'.repeat(64);

// Every var required by packages/config/secrets-validator.ts must be present so
// modules that import @health-watchers/config don't trigger process.exit(1).
process.env.STELLAR_PLATFORM_PUBLIC_KEY =
  process.env.STELLAR_PLATFORM_PUBLIC_KEY || 'TEST_PLATFORM_PUBLIC_KEY';
process.env.STELLAR_SECRET_KEY = process.env.STELLAR_SECRET_KEY || 'test-stellar-secret-key';
// 64-char hex (32 bytes) so lib/encrypt.ts can construct its key.
process.env.KEYPAIR_ENCRYPTION_KEY = process.env.KEYPAIR_ENCRYPTION_KEY || 'b'.repeat(64);
