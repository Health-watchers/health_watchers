/**
 * Predefined API Key Scopes
 * Scopes follow a resource:action pattern for fine-grained access control.
 *
 * This module is the single canonical scope registry — the model, the
 * validation schemas, the middleware and the web UI all derive from it.
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

  // Lab result scopes
  LAB_RESULTS_READ: 'lab-results:read',
  LAB_RESULTS_WRITE: 'lab-results:write',

  // AI scopes
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write',

  // Admin scopes
  API_KEYS_MANAGE: 'api-keys:manage',
  API_KEYS_READ: 'api-keys:read',

  // #1435 — SMART-on-FHIR style read scopes for the /fhir/r4 API
  PATIENT_ALL_READ: 'patient/*.read',
  PATIENT_PATIENT_READ: 'patient/Patient.read',
  PATIENT_ENCOUNTER_READ: 'patient/Encounter.read',
  PATIENT_OBSERVATION_READ: 'patient/Observation.read',
} as const;

export type ApiKeyScope = (typeof PREDEFINED_SCOPES)[keyof typeof PREDEFINED_SCOPES];

/** FHIR read scopes — read-only, matched against the /fhir/r4 surface. */
export const FHIR_SCOPES: readonly ApiKeyScope[] = [
  PREDEFINED_SCOPES.PATIENT_ALL_READ,
  PREDEFINED_SCOPES.PATIENT_PATIENT_READ,
  PREDEFINED_SCOPES.PATIENT_ENCOUNTER_READ,
  PREDEFINED_SCOPES.PATIENT_OBSERVATION_READ,
];

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

  [PREDEFINED_SCOPES.LAB_RESULTS_READ]: [
    /^\/api\/v1\/lab-results\/?$/i,
    /^\/api\/v1\/lab-results\/[^/]+\/?$/i,
  ],
  [PREDEFINED_SCOPES.LAB_RESULTS_WRITE]: [/^\/api\/v1\/lab-results\/?$/i],

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

  [PREDEFINED_SCOPES.PATIENT_ALL_READ]: [/^\/fhir\/r4\//i],
  [PREDEFINED_SCOPES.PATIENT_PATIENT_READ]: [/^\/fhir\/r4\/Patient(\/[^/]+)?\/?$/i],
  [PREDEFINED_SCOPES.PATIENT_ENCOUNTER_READ]: [/^\/fhir\/r4\/Encounter(\/[^/]+)?\/?$/i],
  [PREDEFINED_SCOPES.PATIENT_OBSERVATION_READ]: [
    /^\/fhir\/r4\/Observation(\/[^/]+)?\/?$/i,
  ],
};

/** Human-readable descriptions used by the UI and the API docs. */
export const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  [PREDEFINED_SCOPES.PATIENTS_READ]: 'Read patients',
  [PREDEFINED_SCOPES.PATIENTS_WRITE]: 'Create and update patients',
  [PREDEFINED_SCOPES.PATIENTS_DELETE]: 'Delete patients',
  [PREDEFINED_SCOPES.ENCOUNTERS_READ]: 'Read encounters',
  [PREDEFINED_SCOPES.ENCOUNTERS_WRITE]: 'Create and update encounters',
  [PREDEFINED_SCOPES.ENCOUNTERS_DELETE]: 'Delete encounters',
  [PREDEFINED_SCOPES.PAYMENTS_READ]: 'Read payments',
  [PREDEFINED_SCOPES.PAYMENTS_WRITE]: 'Create and update payments',
  [PREDEFINED_SCOPES.PAYMENTS_CONFIRM]: 'Confirm payments',
  [PREDEFINED_SCOPES.LAB_RESULTS_READ]: 'Read lab results',
  [PREDEFINED_SCOPES.LAB_RESULTS_WRITE]: 'Create and update lab results',
  [PREDEFINED_SCOPES.AI_READ]: 'Read AI insights',
  [PREDEFINED_SCOPES.AI_WRITE]: 'Submit AI requests',
  [PREDEFINED_SCOPES.API_KEYS_MANAGE]: 'Manage API keys',
  [PREDEFINED_SCOPES.API_KEYS_READ]: 'Read API key metadata',
  [PREDEFINED_SCOPES.PATIENT_ALL_READ]: 'FHIR: read all patient-compartment resources',
  [PREDEFINED_SCOPES.PATIENT_PATIENT_READ]: 'FHIR: read Patient resources',
  [PREDEFINED_SCOPES.PATIENT_ENCOUNTER_READ]: 'FHIR: read Encounter resources',
  [PREDEFINED_SCOPES.PATIENT_OBSERVATION_READ]: 'FHIR: read Observation resources',
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

  const upper = method.toUpperCase();
  const isFhirScope = scope.startsWith('patient/');

  // FHIR scopes are read-only and only apply to the FHIR surface.
  if (isFhirScope) {
    if (!['GET', 'HEAD'].includes(upper)) return false;
    return patterns.some((pattern) => pattern.test(endpoint));
  }

  // For read operations, only :read scopes apply
  if (['GET', 'HEAD'].includes(upper)) {
    if (!scope.includes(':read')) return false;
  }

  // For write operations (POST, PUT, PATCH), only :write scopes apply
  if (['POST', 'PUT', 'PATCH'].includes(upper)) {
    if (!scope.includes(':write') && !scope.includes(':confirm') && !scope.includes(':manage'))
      return false;
  }

  // For delete operations, only :delete scopes apply
  if (upper === 'DELETE') {
    if (!scope.includes(':delete')) return false;
  }

  return patterns.some((pattern) => pattern.test(endpoint));
};

/**
 * Scopes that could grant access to the given endpoint/method combination.
 * Used to build helpful 403 payloads.
 */
export const getRequiredScopesForEndpoint = (
  endpoint: string,
  method: string
): ApiKeyScope[] =>
  getAllScopes().filter((scope) => {
    const patterns = SCOPE_ENDPOINT_MAP[scope];
    if (!patterns) return false;
    return patterns.some((pattern) => pattern.test(endpoint));
  });
