import { RequestHandler } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';

type Schema = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

const fmt = (e: ZodError) =>
  e.issues.map((i) => ({ field: i.path.join('.') || 'root', message: i.message, code: i.code }));

export const validateRequest = (schema: Schema): RequestHandler =>
  async (req, res, next) => {
    try {
      if (schema.body)   req.body   = await schema.body.parseAsync(req.body);
      if (schema.query)  req.query  = await schema.query.parseAsync(req.query)   as typeof req.query;
      if (schema.params) req.params = await schema.params.parseAsync(req.params) as Record<string, string>;
      next();
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ error: 'ValidationError', message: 'Request validation failed', issues: fmt(err) });
      next(err);
    }
  };
