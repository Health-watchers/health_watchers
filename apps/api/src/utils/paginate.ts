import { Model, FilterQuery } from 'mongoose';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function paginate<T>(
  model: Model<T>,
  query: FilterQuery<T>,
  page: number,
  limit: number,
  sort: Record<string, 1 | -1> = { createdAt: -1 }
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const [total, data] = await Promise.all([
    model.countDocuments(query),
    model.find(query).sort(sort).skip((page - 1) * limit).limit(limit).lean() as Promise<T[]>,
  ]);
  return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export function parsePagination(query: Record<string, any>): { page: number; limit: number } | null {
  const page  = Math.max(1, parseInt(query.page  as string) || 1);
  const limit = parseInt(query.limit as string) || 20;
  if (limit > 100) return null;
  return { page, limit: Math.max(1, limit) };
}
