import { AppRole } from '../types/express';

export type FieldAccessMap = Record<string, AppRole[]>;

const DEFAULT_ACCESS: FieldAccessMap = {
  billingCode: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  paymentDetails: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  invoiceAmount: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  cost: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  reimbursementRate: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  policyNumber: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  groupNumber: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  insuranceProvider: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  coverageDetails: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
  ssn: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  nationalId: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  auditTrail: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  internalNotes: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  systemNotes: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  salary: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  performanceNotes: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  aiConfidence: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  aiRawOutput: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'],
  complianceFlags: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  breachRisk: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
};

export function stripRestrictedFields<T extends Record<string, any>>(
  data: T,
  role: AppRole,
  accessMap: FieldAccessMap = DEFAULT_ACCESS
): Partial<T> {
  if (role === 'SUPER_ADMIN') return data;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const allowedRoles = accessMap[key];
    if (allowedRoles && !allowedRoles.includes(role)) {
      continue;
    }
    result[key] = value;
  }
  return result as Partial<T>;
}

export function stripRestrictedFieldsDeep(
  body: unknown,
  role: AppRole,
  accessMap: FieldAccessMap = DEFAULT_ACCESS
): unknown {
  if (role === 'SUPER_ADMIN') return body;
  if (body === null || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map((item) => stripRestrictedFieldsDeep(item, role, accessMap));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const allowedRoles = accessMap[key];
    if (allowedRoles && !allowedRoles.includes(role)) continue;
    result[key] = stripRestrictedFieldsDeep(value, role, accessMap);
  }
  return result;
}
