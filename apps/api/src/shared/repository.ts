export interface Repository<T, Id = string> {
  findById(id: Id): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: Id): Promise<void>;
}

/**
 * Minimal shape of the authenticated caller needed for tenant scoping.
 * Compatible with the API's `req.user` payload.
 */
export interface ScopedUser {
  clinicId?: string | null;
  patientId?: string | null;
  role?: string | null;
  id?: string | null;
  userId?: string | null;
}

export interface FindScopedOptions {
  /**
   * Force a `patientId` filter even when the caller is not a patient-portal
   * user. Used by patient-portal-facing routes.
   */
  patientScoped?: boolean;
  /** Extra filter fields merged into the tenant-scoped query. */
  filter?: Record<string, unknown>;
  /** Projection passed through to the model. */
  projection?: Record<string, unknown>;
  /** Override the tenant field name (defaults to `clinicId`). */
  tenantField?: string;
  /** Override the patient field name (defaults to `patientId`). */
  patientField?: string;
  /** Resource label used in audit log entries. */
  resource?: string;
}

/**
 * Minimal model interface required by `findScoped`.
 * Compatible with Mongoose models.
 */
export interface ScopedModel<T> {
  findOne(
    filter: Record<string, unknown>,
    projection?: Record<string, unknown>,
  ): { lean?(): Promise<T | null> } | Promise<T | null>;
}

export interface AuditLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
}

let auditLogger: AuditLogger | null = null;

/**
 * Registers the logger used to record denied cross-tenant access attempts.
 * Call once during application bootstrap (e.g. with the shared winston/pino
 * logger). Falls back to `console` when unset.
 */
export function setScopedAuditLogger(logger: AuditLogger | null): void {
  auditLogger = logger;
}

function getAuditLogger(): AuditLogger {
  return auditLogger ?? console;
}

function isPatientPortalUser(user: ScopedUser): boolean {
  return user.role === 'patient' || user.role === 'PATIENT';
}

/**
 * Loads a record by ID while enforcing tenant scoping.
 *
 * The query always includes `_id: id` and the caller's `clinicId`. When the
 * caller is a patient-portal user (or `options.patientScoped` is set) the
 * query also includes the caller's `patientId`.
 *
 * Returns `null` when the record does not exist *or* belongs to another
 * tenant, so callers can respond with `404` without leaking existence.
 * Denied cross-clinic attempts are written to the audit log.
 */
export async function findScoped<T>(
  model: ScopedModel<T>,
  id: string,
  user: ScopedUser | undefined | null,
  options: FindScopedOptions = {},
): Promise<T | null> {
  const tenantField = options.tenantField ?? 'clinicId';
  const patientField = options.patientField ?? 'patientId';
  const resource = options.resource ?? 'record';

  const clinicId = user?.clinicId ?? null;
  const patientId = user?.patientId ?? null;
  const requirePatient = options.patientScoped === true || isPatientPortalUser(user ?? {});

  const filter: Record<string, unknown> = {
    ...(options.filter ?? {}),
    _id: id,
  };

  if (clinicId) {
    filter[tenantField] = clinicId;
  }

  if (requirePatient) {
    if (!patientId) {
      getAuditLogger().warn('Denied tenant-scoped lookup: missing patient context', {
        resource,
        recordId: id,
        clinicId,
        userId: user?.id ?? user?.userId ?? null,
        reason: 'missing_patient_context',
      });
      return null;
    }
    filter[patientField] = patientId;
  }

  const query = model.findOne(filter, options.projection);
  const result = await (query && typeof (query as { lean?: unknown }).lean === 'function'
    ? (query as { lean(): Promise<T | null> }).lean()
    : (query as Promise<T | null>));

  if (result === null || result === undefined) {
    // Distinguish "does not exist" from "exists in another tenant" for audit
    // purposes without leaking the distinction to the caller.
    if (clinicId) {
      const existsElsewhere = await (model.findOne({ _id: id }) as Promise<T | null>);
      if (existsElsewhere) {
        getAuditLogger().warn('Denied cross-clinic access attempt', {
          resource,
          recordId: id,
          clinicId,
          userId: user?.id ?? user?.userId ?? null,
          reason: 'cross_tenant',
        });
      }
    }
    return null;
  }

  return result;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface TextSearchOptions {
  page?: number;
  limit?: number;
  projection?: Record<string, unknown>;
  baseFilter?: Record<string, unknown>;
}

export interface ParsedSearchQuery {
  q: string;
}

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 200;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Trims and validates a search query string.
 * Returns null when the query is absent or invalid (too short / too long).
 */
export function parseSearchQuery(
  query: Record<string, unknown> | undefined | null,
): ParsedSearchQuery | null {
  if (!query) {
    return null;
  }

  const raw = query.q;
  if (typeof raw !== 'string') {
    return null;
  }

  const q = raw.trim();
  if (q.length < MIN_SEARCH_LENGTH || q.length > MAX_SEARCH_LENGTH) {
    return null;
  }

  return { q };
}

function normalizePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  const int = Math.floor(parsed);
  return max !== undefined ? Math.min(int, max) : int;
}

/**
 * Minimal model interface required by the text search helper.
 * Compatible with Mongoose models.
 */
export interface TextSearchModel<T> {
  find(filter: Record<string, unknown>, projection?: Record<string, unknown>): {
    sort(sort: Record<string, unknown>): {
      skip(n: number): {
        limit(n: number): {
          lean(): Promise<T[]>;
        };
      };
    };
  };
  countDocuments(filter: Record<string, unknown>): Promise<number>;
}

/**
 * Builds a `$text` search query against a model, projecting the text score
 * and sorting by relevance (score descending). Returns results in the same
 * `{ data, meta }` shape as `paginate`.
 */
export async function textSearch<T>(
  model: TextSearchModel<T>,
  baseFilter: Record<string, unknown>,
  q: string,
  options: TextSearchOptions = {},
): Promise<PaginatedResult<T>> {
  const page = normalizePositiveInt(options.page, DEFAULT_PAGE);
  const limit = normalizePositiveInt(options.limit, DEFAULT_LIMIT, MAX_LIMIT);

  const filter: Record<string, unknown> = {
    ...(baseFilter ?? {}),
    $text: { $search: q },
  };

  const projection: Record<string, unknown> = {
    ...(options.projection ?? {}),
    score: { $meta: 'textScore' },
  };

  const [data, total] = await Promise.all([
    model
      .find(filter, projection)
      .sort({ score: { $meta: 'textScore' } })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    model.countDocuments(filter),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}