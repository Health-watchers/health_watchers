import { NextFunction, Request, RequestHandler, Response } from 'express';

export const sendSuccess = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ status: 'success', data });

export const sendError = (res: Response, status: number, error: string, message: string) =>
  res.status(status).json({ error, message });

export class AppError extends Error {
  constructor(public status: number, public error: string, message: string) {
    super(message);
  }
}

// Wraps an async route handler so rejected promises reach Express's error middleware
// instead of being silently dropped (Express does not await handlers). Generic over the
// request type so callers can keep their route-specific Request<Params, ...> annotations.
export const asyncHandler =
  <ReqT extends Request = Request>(
    fn: (req: ReqT, res: Response, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    fn(req as unknown as ReqT, res, next).catch(next);
  };

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export const parsePagination = (query: Record<string, unknown>): Pagination => {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(String(query.limit ?? DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

export const paginatedResponse = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
});
