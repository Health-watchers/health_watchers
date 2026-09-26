# Per-Resource Rate Limiting

Rate limits should combine user identity, tenant, route, and resource identifiers.

Examples:

- `tenant:{tenantId}:patient:{patientId}:read`
- `tenant:{tenantId}:auth:login`
- `tenant:{tenantId}:export:create`

Return `429` with retry metadata when limits are exceeded.
