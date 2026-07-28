import { Request, Response, NextFunction } from 'express';
import { decodeCursor } from '../utils/paginate';

export interface ParsedPagination {
  page: number;
  limit: number;
  sort: Record<string, 1 | -1>;
  sortRaw: string;
  cursor?: string;
}

export interface PaginationMiddlewareOptions {
  allowedSortFields?: string[];
  defaultSort?: string;
  allowCursor?: boolean;
}

export function paginationMiddleware(
  options: PaginationMiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const { allowedSortFields = [], defaultSort = 'createdAt_desc', allowCursor = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const query = req.query as Record<string, string>;

    // Parse page
    const rawPage = parseInt(query.page ?? '1', 10);
    if (isNaN(rawPage) || rawPage < 1) {
      res
        .status(400)
        .json({ error: 'ValidationError', message: 'page must be a positive integer' });
      return;
    }

    // Parse limit
    const rawLimit = parseInt(query.limit ?? '20', 10);
    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must be between 1 and 100' });
      return;
    }

    // Parse sort
    const sortRaw = query.sort ?? defaultSort;
    const sortMatch = /^([a-zA-Z_]+)_(asc|desc)$/.exec(sortRaw);
    if (!sortMatch) {
      res
        .status(400)
        .json({ error: 'ValidationError', message: 'sort must be field_asc or field_desc' });
      return;
    }
    const [, sortField, sortDir] = sortMatch;
    if (allowedSortFields.length > 0 && !allowedSortFields.includes(sortField)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `sort field '${sortField}' not allowed. Allowed: ${allowedSortFields.join(', ')}`,
      });
      return;
    }
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir === 'asc' ? 1 : -1 };

    // Parse cursor (optional)
    let cursor: string | undefined;
    if (allowCursor && query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (!decoded) {
        res.status(400).json({ error: 'ValidationError', message: 'Invalid cursor value' });
        return;
      }
      cursor = decoded;
    }

    (res.locals as Record<string, unknown>).pagination = {
      page: rawPage,
      limit: rawLimit,
      sort,
      sortRaw,
      cursor,
    } as ParsedPagination;
    next();
  };
}
