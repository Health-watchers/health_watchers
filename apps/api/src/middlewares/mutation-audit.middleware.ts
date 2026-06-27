import { Request, Response, NextFunction } from 'express';
import { auditLog } from '../modules/audit/audit.service';
import { AuditAction } from '../modules/audit/audit.model';
import logger from '../utils/logger';

const METHOD_ACTION_MAP: Record<string, AuditAction> = {
  POST: 'MUTATION_CREATE',
  PUT: 'MUTATION_UPDATE',
  PATCH: 'MUTATION_UPDATE',
  DELETE: 'MUTATION_DELETE',
};

/**
 * Automatically records a DB audit entry for every mutating request (POST/PUT/PATCH/DELETE).
 * Only fires on 2xx responses to avoid logging failed validation attempts as successful mutations.
 */
export function mutationAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const action = METHOD_ACTION_MAP[req.method];
  if (!action) {
    next();
    return;
  }

  const originalSend = res.send.bind(res);

  res.send = function (body: unknown): Response {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const resourceId =
        req.params.id || req.params.patientId || req.params.encounterId || undefined;
      const resourceType = req.path.split('/').filter(Boolean)[0];

      auditLog(
        {
          action,
          resourceType,
          resourceId,
          userId: req.user?.userId,
          clinicId: req.user?.clinicId,
          outcome: 'SUCCESS',
          metadata: { method: req.method, path: req.path },
        },
        req,
      ).catch((err) => {
        logger.error({ err }, 'mutation audit log failed');
      });
    }
    return originalSend(body);
  };

  next();
}
