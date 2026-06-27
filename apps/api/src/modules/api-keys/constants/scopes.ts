/**
 * Predefined API Key Scopes
 * Scopes follow a resource:action pattern for fine-grained access control
 */

export const PREDEFINED_SCOPES = {
  // Patient scopes
  PATIENTS_READ: 'patients:read',
  PATIENTS_WRITE: 'patients:write',
  PATIENTS_DELETE: 'patients:delete',

  // Encounter scopes
  ENCOUNTERS_READ: 'encounters:read',
  ENCOUNTERS_WRITE: 'encounters:write',
  ENCOUNTERS_DELETE: 'encounters:delete',

  // Payment scopes
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
  PAYMENTS_CONFIRM: 'payments:confirm',

  // AI scopes
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write',

  // Admin scopes
  API_KEYS_MANAGE: 'api-keys:manage',
  API_KEYS_READ: 'api-keys:read',
} as const;

export type ApiKeyScope = (typeof PREDEFINED_SCOPES)[keyof typeof PREDEFINED_SCOPES];

/**
 * Scope to endpoint pattern mapping
 * Used for validating if a scope grants access to a specific endpoint
 */
export const SCOPE_ENDPOINT_MAP: Record<ApiKeyScope, RegExp[]> = {
  [PREDEFINED_SCOPES.PATIENTS_READ]: [
    /^\/api\/v1\/patients\/?$/i,
    /^\/api\/v1\/patients\/[^/]+\/?$/i,
  ],
  [PREDEFINED_SCOPES.PATIENTS_WRITE]: [/^\/api\/v1\/patients\/?$/i],
  [PREDEFINED_SCOPES.PATIENTS_DELETE]: [/^\/api\/v1\/patients\/[^/]+\/?$/i],

  [PREDEFINED_SCOPES.ENCOUNTERS_READ]: [
    /^\/api\/v1\/encounters\/?$/i,
    /^\/api\/v1\/encounters\/[^/]+\/?$/i,
  ],
  [PREDEFINED_SCOPES.ENCOUNTERS_WRITE]: [/^\/api\/v1\/encounters\/?$/i],
  [PREDEFINED_SCOPES.ENCOUNTERS_DELETE]: [/^\/api\/v1\/encounters\/[^/]+\/?$/i],

  [PREDEFINED_SCOPES.PAYMENTS_READ]: [
    /^\/api\/v1\/payments\/?$/i,
    /^\/api\/v1\/payments\/[^/]+\/?$/i,
  ],
  [PREDEFINED_SCOPES.PAYMENTS_WRITE]: [/^\/api\/v1\/payments\/?$/i],
  [PREDEFINED_SCOPES.PAYMENTS_CONFIRM]: [/^\/api\/v1\/payments\/[^/]+\/confirm\/?$/i],

  [PREDEFINED_SCOPES.AI_READ]: [/^\/api\/v1\/ai\/?$/i],
  [PREDEFINED_SCOPES.AI_WRITE]: [/^\/api\/v1\/ai\/?$/i],

  [PREDEFINED_SCOPES.API_KEYS_MANAGE]: [
    /^\/api\/v1\/api-keys\/?$/i,
    /^\/api\/v1\/api-keys\/[^/]+\/?$/i,
  ],
  [PREDEFINED_SCOPES.API_KEYS_READ]: [
    /^\/api\/v1\/api-keys\/?$/i,
    /^\/api\/v1\/api-keys\/[^/]+\/?$/i,
  ],
};

/**
 * Get all available scopes
 */
export const getAllScopes = (): ApiKeyScope[] => Object.values(PREDEFINED_SCOPES);

/**
 * Check if a scope grants access to an endpoint
 */
export const scopeGrantsAccess = (
  scope: ApiKeyScope,
  endpoint: string,
  method: string
): boolean => {
  const patterns = SCOPE_ENDPOINT_MAP[scope];
  if (!patterns) return false;

  // For read operations, only :read scopes apply
  if (['GET', 'HEAD'].includes(method.toUpperCase())) {
    if (!scope.includes(':read')) return false;
  }

  // For write operations (POST, PUT, PATCH), only :write scopes apply
  if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    if (!scope.includes(':write') && !scope.includes(':confirm') && !scope.includes(':manage'))
      return false;
  }

  // For delete operations, only :delete scopes apply
  if (method.toUpperCase() === 'DELETE') {
    if (!scope.includes(':delete')) return false;
  }

  return patterns.some((pattern) => pattern.test(endpoint));
};
