import { Request, Response, NextFunction } from 'express';
import { auditLog } from '../modules/audit/audit.service';
import { AuditAction } from '../modules/audit/audit.model';

/**
 * Middleware to automatically log audit events for specific routes
 */
export function auditMiddleware(action: AuditAction, resourceType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: any): Response {
      // Only log if response is successful (2xx status code)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || req.params.patientId || req.params.encounterId;
        
        auditLog(
          {
            action,
            resourceType,
            resourceId,
            userId: req.user?.userId,
            clinicId: req.user?.clinicId,
            outcome: 'SUCCESS',
          },
          req
        ).catch((error) => {
          console.error('Audit logging failed:', error);
        });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
}
