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
process.env.STELLAR_PLATFORM_PUBLIC_KEY =
  process.env.STELLAR_PLATFORM_PUBLIC_KEY || 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
process.env.STELLAR_SECRET_KEY =
  process.env.STELLAR_SECRET_KEY || 'SCZANGBA5RLKFED4ZOLNPBTBRHCPZLH67B5R7CJTE2XK6XYXCRFVF3V';
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY || 'test-field-encryption-key-32-char';
process.env.KEYPAIR_ENCRYPTION_KEY =
  process.env.KEYPAIR_ENCRYPTION_KEY || 'test-keypair-encryption-key-32chr';
