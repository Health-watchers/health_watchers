// Provide JWT secrets before any module is imported so token.service.ts
// doesn't throw "JWT secrets are required" at module-load time.
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.JWT_SECRET         = 'test-access-secret-32-chars-long!!';
