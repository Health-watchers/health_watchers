import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validateRequest(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid request body",
          details: result.error.errors,
        });
      }
      req.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid request params",
          details: result.error.errors,
        });
        return;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid query parameters",
          details: result.error.errors,
        });
      }
    }

    return next();
  };
}
