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
