export interface Repository<T, Id = string> {
  findById(id: Id): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: Id): Promise<void>;
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