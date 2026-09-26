import { Request, Response, NextFunction } from 'express';
import { AppRole } from '../types/express';

/**
 * Fields that are restricted to specific roles.
 * A field listed here is REMOVED from the response for any role NOT in its allowed set.
 *
 * Role hierarchy (highest → lowest):
 *   SUPER_ADMIN → CLINIC_ADMIN → DOCTOR → NURSE → ASSISTANT → READ_ONLY → PATIENT
 */
const FIELD_RULES: Array<{ field: string; allowedRoles: AppRole[]; description?: string }> = [
  // Financial / billing fields — admin and doctors only
  {
    field: 'billingCode',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Internal billing code for the service',
  },
  {
    field: 'paymentDetails',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Detailed payment transaction information',
  },
  {
    field: 'invoiceAmount',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Invoice amount in billing currency',
  },
  {
    field: 'cost',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Internal cost data',
  },
  {
    field: 'reimbursementRate',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Insurance reimbursement rate',
  },

  // Insurance sensitive fields — admin, doctors, nurses
  {
    field: 'policyNumber',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
    description: 'Insurance policy number',
  },
  {
    field: 'groupNumber',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
    description: 'Insurance group number',
  },
  {
    field: 'insuranceProvider',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
    description: 'Insurance provider name',
  },
  {
    field: 'coverageDetails',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
    description: 'Detailed insurance coverage information',
  },

  // Government identifier — admin only
  {
    field: 'ssn',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'Social Security Number',
  },
  {
    field: 'nationalId',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'National identity number',
  },

  // Internal audit / system fields — admin only
  {
    field: 'auditTrail',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'Internal audit trail of changes',
  },
  {
    field: 'internalNotes',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Internal clinical notes not visible to patients',
  },
  {
    field: 'systemNotes',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Internal system-generated notes',
  },

  // Staff-only fields — non-patients
  {
    field: 'salary',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'Staff salary information',
  },
  {
    field: 'performanceNotes',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'Staff performance notes',
  },

  // Diagnostic internals — doctors and above
  {
    field: 'aiConfidence',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'AI diagnostic confidence score',
  },
  {
    field: 'aiRawOutput',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
    description: 'Raw AI model output',
  },

  // Research / compliance — admin only
  {
    field: 'complianceFlags',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'Compliance violation flags',
  },
  {
    field: 'breachRisk',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    description: 'HIPAA breach risk assessment',
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
 * Returns the field filter rules for documentation purposes.
 */
export function getFieldFilterRules(): Array<{
  field: string;
  allowedRoles: AppRole[];
  description?: string;
}> {
  return [...FIELD_RULES];
}

/**
 * Filters a response body based on the user's role.
 * Exported for use by transformers and tests.
 */
export function filterByRole(body: unknown, role: AppRole): unknown {
  return filterFields(body, role);
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
