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

// Middleware
export { authenticateApiKey, validateApiKeyScopes } from './api-key.middleware';

// Controllers
export {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  getApiKeyUsage,
  getAvailableScopes,
} from './api-key.controller';

// Routes
export { default as apiKeyRoutes } from './api-key.routes';

// Validation
export {
  createApiKeySchema,
  updateApiKeySchema,
  listApiKeysSchema,
  type CreateApiKeyDto,
  type UpdateApiKeyDto,
  type ListApiKeysQuery,
} from './api-key.validation';

// Constants
export {
  PREDEFINED_SCOPES,
  SCOPE_ENDPOINT_MAP,
  getAllScopes,
  scopeGrantsAccess,
  type ApiKeyScope,
} from './constants/scopes';
