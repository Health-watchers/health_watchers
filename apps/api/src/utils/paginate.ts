import { Model, FilterQuery, Types } from 'mongoose';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor: string | null;
}

export function encodeCursor(id: Types.ObjectId | string): string {
  return Buffer.from(id.toString(), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string | null {
  const raw = Types.ObjectId.isValid(cursor)
    ? cursor
    : Buffer.from(cursor, 'base64url').toString('utf8');
  return Types.ObjectId.isValid(raw) ? raw : null;
}

/**
 * Recursively removes MongoDB operator keys that could allow
 * user-controlled data to alter query logic (NoSQL injection).
 */
function sanitizeQuery<T>(query: FilterQuery<T>): FilterQuery<T> {
  const BLOCKED_OPERATORS = new Set(['$where', '$expr', '$function', '$accumulator']);

  function sanitize(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (BLOCKED_OPERATORS.has(key)) continue;
      clean[key] = sanitize(value);
    }
    return clean;
  }

  return sanitize(query) as FilterQuery<T>;
}

export interface PaginateOptions {
  sort?: Record<string, 1 | -1>;
  /** Selective field projection — pass only the fields you need (1 = include, 0 = exclude). */
  projection?: Record<string, 0 | 1>;
  /** MongoDB query hint — name of the index to force (e.g. 'clinicId_1_isActive_1'). */
  hint?: string | Record<string, unknown>;
}

export async function paginate<T>(
  model: Model<T>,
  query: FilterQuery<T>,
  page: number,
  limit: number,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
  options?: PaginateOptions
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const safeQuery = sanitizeQuery(query);
  const effectiveSort = options?.sort ?? sort;
  const projection = options?.projection;
  const hint = options?.hint;

  let findQuery = model.find(safeQuery);
  if (projection) findQuery = findQuery.select(projection as Record<string, 0 | 1>);
  if (hint) findQuery = findQuery.hint(hint as any);

  const [total, data] = await Promise.all([
    model.countDocuments(safeQuery),
    findQuery
      .sort(effectiveSort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as Promise<T[]>,
  ]);
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const lastDoc = data[data.length - 1] as (T & { _id?: Types.ObjectId }) | undefined;
  const nextCursor = hasNextPage && lastDoc?._id ? encodeCursor(lastDoc._id) : null;
  return {
    data,
    meta: { total, page, limit, totalPages, hasNextPage, hasPrevPage, nextCursor },
  };
}

export function parsePagination(
  query: Record<string, unknown>
): { page: number; limit: number } | null {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  // Default and max page size are defined in constants.ts (#1063)
  const limit = parseInt(query.limit as string) || 20; // DEFAULT_PAGE_SIZE = 20
  if (limit > 100) return null; // MAX_PAGE_SIZE = 100
  return { page, limit: Math.max(1, limit) };
}

export interface CursorPaginationResult<T> {
  data: T[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

/** Cursor-based pagination using _id as the cursor (O(1) regardless of depth). */
export async function paginateCursor<T>(
  model: Model<T>,
  query: FilterQuery<T>,
  limit: number,
  cursor?: string,
  sort: Record<string, 1 | -1> = { _id: -1 }
): Promise<CursorPaginationResult<T>> {
  const baseQuery: FilterQuery<T> = { ...sanitizeQuery(query) };
  if (cursor) {
    const decodedCursor = decodeCursor(cursor);
    if (!decodedCursor) {
      throw new Error('Invalid cursor value');
    }
    const cursorId = new Types.ObjectId(decodedCursor);
    const direction = (sort._id ?? -1) === -1 ? '$lt' : '$gt';
    (baseQuery as Record<string, unknown>)._id = { [direction]: cursorId };
  }
  const data = (await model
    .find(baseQuery)
    .sort(sort)
    .limit(limit + 1)
    .lean()) as (T & { _id?: Types.ObjectId })[];
  const hasNextPage = data.length > limit;
  if (hasNextPage) data.pop();
  const lastDoc = data[data.length - 1];
  const nextCursor = hasNextPage && lastDoc?._id ? encodeCursor(lastDoc._id) : null;
  return { data: data as T[], meta: { limit, hasNextPage, nextCursor } };
}

export function parseCursorPagination(query: Record<string, unknown>): {
  limit: number;
  cursor: string | undefined;
} | null {
  const limit = parseInt(query.limit as string) || 20;
  if (limit < 1 || limit > 100) return null;
  const cursor = (query.cursor as string) || undefined;
  if (cursor && !decodeCursor(cursor)) return null;
  return { limit, cursor };
}
