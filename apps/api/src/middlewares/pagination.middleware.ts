import { Request, Response, NextFunction } from 'express';
import { decodeCursor } from '../utils/paginate';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

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

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: 'ValidationError', message });
}

export function paginationMiddleware(
  options: PaginationMiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const { allowedSortFields = [], defaultSort = 'createdAt_desc', allowCursor = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const query = req.query as Record<string, string>;

    // Parse page (positive integer, defaults to 1)
    const rawPage = query.page === undefined ? DEFAULT_PAGE : Number(query.page);
    if (!Number.isInteger(rawPage) || rawPage < 1) {
      validationError(res, 'page must be a positive integer');
      return;
    }

    // Parse limit (integer between 1 and 100, defaults to 20)
    const rawLimit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
      validationError(res, `limit must be an integer between 1 and ${MAX_LIMIT}`);
      return;
    }

    // Parse sort (field_asc | field_desc, validated against per-endpoint allowlist)
    const sortRaw = query.sort ?? defaultSort;
    const sortMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)_(asc|desc)$/.exec(sortRaw);
    if (!sortMatch) {
      validationError(res, 'sort must be in the format field_asc or field_desc');
      return;
    }
    const [, sortField, sortDir] = sortMatch;
    if (allowedSortFields.length > 0 && !allowedSortFields.includes(sortField)) {
      validationError(
        res,
        `sort field '${sortField}' not allowed. Allowed: ${allowedSortFields.join(', ')}`
      );
      return;
    }
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir === 'asc' ? 1 : -1 };

    // Parse cursor (optional, only when enabled for the endpoint)
    let cursor: string | undefined;
    if (allowCursor && query.cursor !== undefined && query.cursor !== '') {
      const decoded = decodeCursor(query.cursor);
      if (!decoded) {
        validationError(res, 'Invalid cursor value');
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
