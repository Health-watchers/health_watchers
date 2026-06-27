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

/**
 * Recursively removes MongoDB operator keys that could allow
 * user-controlled data to alter query logic (NoSQL injection).
 */
function sanitizeQuery<T>(query: FilterQuery<T>): FilterQuery<T> {
  const BLOCKED_OPERATORS = new Set([
    '$where',
    '$expr',
    '$function',
    '$accumulator',
  ]);

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

export async function paginate<T>(
  model: Model<T>,
  query: FilterQuery<T>,
  page: number,
  limit: number,
  sort: Record<string, 1 | -1> = { createdAt: -1 }
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const safeQuery = sanitizeQuery(query);
  const [total, data] = await Promise.all([
    model.countDocuments(safeQuery),
    model
      .find(safeQuery)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as Promise<T[]>,
  ]);
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const lastDoc = data[data.length - 1] as (T & { _id?: Types.ObjectId }) | undefined;
  const nextCursor = hasNextPage && lastDoc?._id ? lastDoc._id.toString() : null;
  return {
    data,
    meta: { total, page, limit, totalPages, hasNextPage, hasPrevPage, nextCursor },
  };
}

export function parsePagination(
  query: Record<string, unknown>
): { page: number; limit: number } | null {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = parseInt(query.limit as string) || 20;
  if (limit > 100) return null;
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
    const cursorId = new Types.ObjectId(cursor);
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
  const nextCursor = hasNextPage && lastDoc?._id ? lastDoc._id.toString() : null;
  return { data: data as T[], meta: { limit, hasNextPage, nextCursor } };
}

export function parseCursorPagination(query: Record<string, unknown>): {
  limit: number;
  cursor: string | undefined;
} | null {
  const limit = parseInt(query.limit as string) || 20;
  if (limit < 1 || limit > 100) return null;
  const cursor = (query.cursor as string) || undefined;
  return { limit, cursor };
}