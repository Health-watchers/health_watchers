/**
 * Filter state for the Audit Log Explorer and its two serialisations:
 *  - the page URL (`/compliance/audit-logs?from=…`) so filters survive a refresh
 *  - the API query (`GET /api/v1/audit?dateFrom=…`) used for listing and CSV export
 */

export interface AuditLogFilters {
  /** Inclusive start date, `YYYY-MM-DD` */
  from: string;
  /** Inclusive end date, `YYYY-MM-DD` */
  to: string;
  userId: string;
  action: string;
  resourceType: string;
  patientId: string;
}

export const EMPTY_AUDIT_FILTERS: AuditLogFilters = {
  from: '',
  to: '',
  userId: '',
  action: '',
  resourceType: '',
  patientId: '',
};

const FILTER_KEYS = Object.keys(EMPTY_AUDIT_FILTERS) as (keyof AuditLogFilters)[];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ParamsLike = { get(name: string): string | null };

/** Reads filters from the page URL, ignoring unknown keys and malformed dates. */
export function filtersFromSearchParams(params: ParamsLike): AuditLogFilters {
  const filters = { ...EMPTY_AUDIT_FILTERS };
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim() ?? '';
    if ((key === 'from' || key === 'to') && value && !DATE_RE.test(value)) continue;
    filters[key] = value;
  }
  return filters;
}

/** Serialises filters for the page URL. Empty values are omitted; key order is stable. */
export function filtersToSearchParams(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}

/**
 * Maps filters onto the audit API's query parameters.
 *
 * - `from`/`to` become `dateFrom`/`dateTo` ISO timestamps covering whole local days.
 * - `patientId` targets the patient record: it becomes `resourceId`, and implies
 *   `resourceType=Patient` unless another resource type was chosen explicitly.
 */
export function filtersToApiParams(
  filters: AuditLogFilters,
  extra: { cursor?: string | null; limit?: number } = {}
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.from) params.set('dateFrom', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set('dateTo', new Date(`${filters.to}T23:59:59.999`).toISOString());
  if (filters.userId.trim()) params.set('userId', filters.userId.trim());
  if (filters.action.trim()) params.set('action', filters.action.trim());

  const patientId = filters.patientId.trim();
  const resourceType = filters.resourceType.trim() || (patientId ? 'Patient' : '');
  if (resourceType) params.set('resourceType', resourceType);
  if (patientId) params.set('resourceId', patientId);

  if (extra.limit) params.set('limit', String(extra.limit));
  if (extra.cursor) params.set('cursor', extra.cursor);
  return params;
}

export function hasActiveFilters(filters: AuditLogFilters): boolean {
  return FILTER_KEYS.some((key) => filters[key].trim() !== '');
}
