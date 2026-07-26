import { Request, Response, NextFunction } from 'express';
import { AppRole } from '../types/express';

/**
 * Fields that are restricted to specific roles.
 * A field listed here is REMOVED from the response for any role NOT in its allowed set.
 *
 * Role hierarchy (highest → lowest):
 *   SUPER_ADMIN → CLINIC_ADMIN → DOCTOR → NURSE → ASSISTANT → READ_ONLY → PATIENT
 */
const FIELD_RULES: Array<{ field: string; allowedRoles: AppRole[] }> = [
  // Financial / billing fields — admin and doctors only
  {
    field: 'billingCode',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  },
  {
    field: 'paymentDetails',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  },
  {
    field: 'invoiceAmount',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  },

  // Insurance sensitive fields — admin, doctors, nurses
  {
    field: 'policyNumber',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  },
  {
    field: 'groupNumber',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  },

  // Government identifier — admin only
  {
    field: 'ssn',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  },

  // Internal audit / system fields — admin only
  {
    field: 'auditTrail',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  },
  {
    field: 'internalNotes',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  },
];

function filterFields(obj: unknown, role: AppRole): unknown {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => filterFields(item, role));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const rule = FIELD_RULES.find((r) => r.field === key);
    if (rule && !rule.allowedRoles.includes(role)) {
      continue; // strip this field
    }
    result[key] = filterFields(value, role);
  }
  return result;
}

/**
 * Intercepts JSON responses and strips fields the requesting user's role
 * is not permitted to see. Adds negligible overhead — only acts on JSON bodies.
 * Must be registered after authentication middleware so `req.user` is populated.
 */
export function responseFilterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role || role === 'SUPER_ADMIN') {
    // SUPER_ADMIN sees everything; unauthenticated requests handled by auth middleware
    next();
    return;
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    const filtered = filterFields(body, role);
    return originalJson(filtered);
  };

  next();
}
