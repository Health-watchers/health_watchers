import { Request, Response, NextFunction } from 'express';
import { auditLog } from '../modules/audit/audit.service';
import { AuditAction } from '../modules/audit/audit.model';
import logger from '../utils/logger';

/**
 * Export-specific audit actions supported by the middleware.
 */
export const EXPORT_AUDIT_ACTIONS = [
  'DATA_EXPORT_REQUEST',
  'DATA_EXPORT_FULFILLED',
] as const;

export type ExportAuditAction = (typeof EXPORT_AUDIT_ACTIONS)[number];

/**
 * Determine whether the given action is an export-specific audit action.
 */
export function isExportAuditAction(action: AuditAction | string): action is ExportAuditAction {
  return (EXPORT_AUDIT_ACTIONS as readonly string[]).includes(action);
}

/**
 * Extract the export format from the request (query or body).
 * Falls back to undefined when no format is present.
 */
export function extractExportFormat(req: Request): string | undefined {
  const fromQuery = req.query?.format;
  const fromBody = (req.body as Record<string, unknown> | undefined)?.format;

  const raw = fromQuery ?? fromBody;

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().toLowerCase();
  }

  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return raw[0].trim().toLowerCase();
  }

  return undefined;
}

/**
 * Extract record counts from the request or response payload.
 * Accepts either a numeric `recordCount` or a `recordCounts` object.
 */
export function extractRecordCounts(
  req: Request,
  data?: unknown
): number | Record<string, number> | undefined {
  const candidates: unknown[] = [
    (req.body as Record<string, unknown> | undefined)?.recordCounts,
    (req.body as Record<string, unknown> | undefined)?.recordCount,
    (req.query as Record<string, unknown> | undefined)?.recordCount,
  ];

  // Try to parse a JSON response body for record counts
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      candidates.push(parsed.recordCounts, parsed.recordCount);
    } catch {
      // Not JSON, ignore
    }
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    candidates.push(obj.recordCounts, obj.recordCount);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const counts: Record<string, number> = {};
      for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          counts[key] = value;
        }
      }
      if (Object.keys(counts).length > 0) {
        return counts;
      }
    }
  }

  return undefined;
}

/**
 * Middleware to automatically log audit events for specific routes
 */
export function auditMiddleware(action: AuditAction, resourceType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: unknown): Response {
      // Only log if response is successful (2xx status code)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || req.params.patientId || req.params.encounterId;

        const exportAction = isExportAuditAction(action);
        const format = exportAction ? extractExportFormat(req) : undefined;
        const recordCounts = exportAction ? extractRecordCounts(req, data) : undefined;

        auditLog(
          {
            action,
            resourceType,
            resourceId,
            userId: req.user?.userId,
            clinicId: req.user?.clinicId,
            outcome: 'SUCCESS',
            ...(format ? { format } : {}),
            ...(recordCounts !== undefined ? { recordCounts } : {}),
            ...(exportAction ? { requester: req.user?.userId } : {}),
          },
          req
        ).catch((error) => {
          logger.error({ err: error }, 'Audit logging failed');
        });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Helper to create an export-specific audit middleware.
 * Logs the export format, record counts, and requester for export actions.
 */
export function auditExport(action: ExportAuditAction, resourceType?: string) {
  return auditMiddleware(action as AuditAction, resourceType);
}