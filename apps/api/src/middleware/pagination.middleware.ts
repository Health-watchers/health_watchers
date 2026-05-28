import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export interface PaginationParams {
  page: number;
  limit: number;
  sort: { field: string; direction: 'asc' | 'desc' };
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default('createdAt_desc'),
});

export function paginationMiddleware(allowedSortFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = paginationSchema.parse(req.query);

      // Parse sort parameter
      const [field, direction] = parsed.sort.split('_');
      if (!allowedSortFields.includes(field)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: `Invalid sort field. Allowed fields: ${allowedSortFields.join(', ')}`,
        });
      }

      if (!['asc', 'desc'].includes(direction)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Sort direction must be "asc" or "desc"',
        });
      }

      (res.locals as any).pagination = {
        page: parsed.page,
        limit: parsed.limit,
        sort: { field, direction: direction as 'asc' | 'desc' },
      };

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'ValidationError',
          message: error.errors[0].message,
        });
      }
      next(error);
    }
  };
}
