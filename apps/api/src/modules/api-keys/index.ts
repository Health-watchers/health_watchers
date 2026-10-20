/**
 * API Keys Module
 * Provides scope-based API key authentication for third-party integrations
 */

// Models
export {
  ApiKeyModel,
  IApiKey,
  generateApiKey,
  hashApiKey,
  getKeyPrefix,
} from './models/api-key.model';
export { ApiKeyUsageModel, IApiKeyUsage } from './models/api-key-usage.model';

// Middleware (consolidated in middlewares/ for shared use across modules)
export {
  authenticateApiKey,
  validateApiKeyScopes,
  requireScope,
  type ApiKeyContext,
  trackApiKeyUsage,
} from '../../middlewares/api-key.middleware';

// Controllers (consolidated from api-keys.controller.ts)
export {
  createApiKey,
  listApiKeys,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  getApiKeyAnalytics,
} from './api-keys.controller';

// Routes (consolidated from api-keys.routes.ts)
export { default as apiKeyRoutes } from './api-keys.routes';

// Validation (consolidated in api-keys.schema.ts)
export {
  createApiKeyBody,
  updateApiKeyBody,
  rotateApiKeyBody,
  revokeApiKeyBody,
} from './api-keys.schema';

// Constants
export {
  PREDEFINED_SCOPES,
  SCOPE_ENDPOINT_MAP,
  getAllScopes,
  scopeGrantsAccess,
  type ApiKeyScope,
} from './constants/scopes';
