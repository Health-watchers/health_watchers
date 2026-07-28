import { filterByRole, getFieldFilterRules, responseFilterMiddleware } from '../../middlewares/response-filter.middleware';
import { stripRestrictedFields, stripRestrictedFieldsDeep } from '../../utils/response.transformer';
import { toAppointmentResponse } from '../../modules/appointments/appointments.transformer';
import { toLabResultResponse } from '../../modules/lab-results/lab-results.transformer';
import { toPatientResponse } from '../../modules/patients/patients.transformer';
import { toEncounterResponse } from '../../modules/encounters/encounters.transformer';
import type { AppRole } from '../../types/express';

describe('Response Filter Middleware', () => {
  const sensitiveData = {
    patientId: 'p123',
    firstName: 'John',
    lastName: 'Doe',
    ssn: '123-45-6789',
    billingCode: 'CPT-99213',
    invoiceAmount: 150.00,
    paymentDetails: { method: 'card', last4: '4242' },
    policyNumber: 'POL-999',
    groupNumber: 'GRP-111',
    internalNotes: 'Follow up on lab results',
    auditTrail: [{ action: 'created', by: 'admin' }],
    contactNumber: '+1234567890',
  };

  describe('filterByRole', () => {
    it('should strip all sensitive fields for PATIENT role', () => {
      const filtered = filterByRole(sensitiveData, 'PATIENT') as Record<string, unknown>;
      expect(filtered.ssn).toBeUndefined();
      expect(filtered.billingCode).toBeUndefined();
      expect(filtered.invoiceAmount).toBeUndefined();
      expect(filtered.paymentDetails).toBeUndefined();
      expect(filtered.policyNumber).toBeUndefined();
      expect(filtered.groupNumber).toBeUndefined();
      expect(filtered.internalNotes).toBeUndefined();
      expect(filtered.auditTrail).toBeUndefined();
      expect(filtered.firstName).toBe('John');
      expect(filtered.contactNumber).toBe('+1234567890');
    });

    it('should strip admin-only fields for DOCTOR role', () => {
      const filtered = filterByRole(sensitiveData, 'DOCTOR') as Record<string, unknown>;
      expect(filtered.ssn).toBeUndefined();
      expect(filtered.auditTrail).toBeUndefined();
      expect(filtered.billingCode).toBe('CPT-99213');
      expect(filtered.invoiceAmount).toBe(150.00);
      expect(filtered.internalNotes).toBe('Follow up on lab results');
    });

    it('should strip admin-only fields for NURSE role', () => {
      const filtered = filterByRole(sensitiveData, 'NURSE') as Record<string, unknown>;
      expect(filtered.ssn).toBeUndefined();
      expect(filtered.auditTrail).toBeUndefined();
      expect(filtered.billingCode).toBeUndefined();
      expect(filtered.invoiceAmount).toBeUndefined();
      expect(filtered.policyNumber).toBe('POL-999');
      expect(filtered.groupNumber).toBe('GRP-111');
    });

    it('should strip billing fields for ASSISTANT role', () => {
      const filtered = filterByRole(sensitiveData, 'ASSISTANT') as Record<string, unknown>;
      expect(filtered.billingCode).toBeUndefined();
      expect(filtered.invoiceAmount).toBeUndefined();
      expect(filtered.paymentDetails).toBeUndefined();
      expect(filtered.policyNumber).toBeUndefined();
      expect(filtered.groupNumber).toBeUndefined();
    });

    it('should strip all sensitive fields for READ_ONLY role', () => {
      const filtered = filterByRole(sensitiveData, 'READ_ONLY') as Record<string, unknown>;
      expect(filtered.ssn).toBeUndefined();
      expect(filtered.billingCode).toBeUndefined();
      expect(filtered.invoiceAmount).toBeUndefined();
      expect(filtered.paymentDetails).toBeUndefined();
      expect(filtered.policyNumber).toBeUndefined();
      expect(filtered.internalNotes).toBeUndefined();
      expect(filtered.auditTrail).toBeUndefined();
    });

    it('should allow everything for SUPER_ADMIN role', () => {
      const filtered = filterByRole(sensitiveData, 'SUPER_ADMIN') as Record<string, unknown>;
      expect(filtered.ssn).toBe('123-45-6789');
      expect(filtered.billingCode).toBe('CPT-99213');
      expect(filtered.invoiceAmount).toBe(150.00);
      expect(filtered.paymentDetails).toEqual({ method: 'card', last4: '4242' });
      expect(filtered.policyNumber).toBe('POL-999');
      expect(filtered.internalNotes).toBe('Follow up on lab results');
      expect(filtered.auditTrail).toEqual([{ action: 'created', by: 'admin' }]);
    });

    it('should filter nested objects', () => {
      const data = {
        name: 'Test',
        details: {
          billingCode: 'X123',
          ssn: '999-99-9999',
          normal: 'visible',
        },
      };
      const filtered = filterByRole(data, 'NURSE') as Record<string, any>;
      expect(filtered.details.billingCode).toBeUndefined();
      expect(filtered.details.ssn).toBeUndefined();
      expect(filtered.details.normal).toBe('visible');
    });

    it('should filter arrays of objects', () => {
      const data = {
        items: [
          { billingCode: 'A', name: 'Item 1' },
          { ssn: 'B', name: 'Item 2' },
        ],
      };
      const filtered = filterByRole(data, 'ASSISTANT') as Record<string, any>;
      expect(filtered.items[0].billingCode).toBeUndefined();
      expect(filtered.items[0].name).toBe('Item 1');
      expect(filtered.items[1].ssn).toBeUndefined();
      expect(filtered.items[1].name).toBe('Item 2');
    });
  });

  describe('getFieldFilterRules', () => {
    it('should return all field filter rules', () => {
      const rules = getFieldFilterRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toHaveProperty('field');
      expect(rules[0]).toHaveProperty('allowedRoles');
    });

    it('should include common sensitive fields', () => {
      const rules = getFieldFilterRules();
      const fields = rules.map((r) => r.field);
      expect(fields).toContain('ssn');
      expect(fields).toContain('billingCode');
      expect(fields).toContain('policyNumber');
      expect(fields).toContain('auditTrail');
      expect(fields).toContain('internalNotes');
    });
  });

  describe('responseFilterMiddleware', () => {
    it('should pass through for SUPER_ADMIN', () => {
      const req = { user: { role: 'SUPER_ADMIN' } } as any;
      const res = { json: jest.fn() } as any;
      const next = jest.fn();
      responseFilterMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should pass through when no user', () => {
      const req = {} as any;
      const res = { json: jest.fn() } as any;
      const next = jest.fn();
      responseFilterMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should intercept res.json for non-admin roles', () => {
      const req = { user: { role: 'PATIENT' } } as any;
      const originalJson = jest.fn().mockReturnValue({});
      const res = { json: originalJson } as any;
      const next = jest.fn();
      responseFilterMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.json).not.toBe(originalJson);
    });
  });
});

describe('Response Transformers with Role Filtering', () => {
  const mockAppointment = {
    _id: 'apt123',
    patientId: 'p123',
    doctorId: 'd456',
    clinicId: 'c789',
    scheduledAt: new Date('2025-01-15T10:00:00Z'),
    duration: 30,
    type: 'checkup',
    status: 'scheduled',
    reason: 'Annual checkup',
    internalNotes: 'Confidential staff note',
    createdAt: new Date('2025-01-10T08:00:00Z'),
    updatedAt: new Date('2025-01-10T08:00:00Z'),
  } as any;

  it('toAppointmentResponse strips internalNotes for PATIENT', () => {
    const response = toAppointmentResponse(mockAppointment, 'PATIENT');
    expect(response.reason).toBe('Annual checkup');
    expect((response as any).internalNotes).toBeUndefined();
  });

  it('toAppointmentResponse includes internalNotes for DOCTOR', () => {
    const response = toAppointmentResponse(mockAppointment, 'DOCTOR');
    expect(response.internalNotes).toBe('Confidential staff note');
  });

  const mockLabResult = {
    _id: 'lab123',
    patientId: 'p123',
    clinicId: 'c789',
    orderedBy: 'd456',
    testName: 'CBC',
    status: 'resulted',
    results: { wbc: 7.5 },
    orderedAt: new Date('2025-01-10'),
    createdAt: new Date('2025-01-10'),
    updatedAt: new Date('2025-01-10'),
  } as any;

  it('toLabResultResponse returns all fields for SUPER_ADMIN', () => {
    const response = toLabResultResponse(mockLabResult, 'SUPER_ADMIN');
    expect(response.testName).toBe('CBC');
    expect(response.results).toEqual({ wbc: 7.5 });
  });
});

describe('stripRestrictedFields', () => {
  it('should return data unchanged for SUPER_ADMIN', () => {
    const data = { ssn: '123', billingCode: 'X' };
    const result = stripRestrictedFields(data, 'SUPER_ADMIN');
    expect(result).toEqual(data);
  });

  it('should strip fields for PATIENT', () => {
    const data = { name: 'John', ssn: '123', billingCode: 'X' };
    const result = stripRestrictedFields(data, 'PATIENT');
    expect(result.name).toBe('John');
    expect(result.ssn).toBeUndefined();
    expect(result.billingCode).toBeUndefined();
  });
});

describe('stripRestrictedFieldsDeep', () => {
  it('should handle null and primitives', () => {
    expect(stripRestrictedFieldsDeep(null, 'PATIENT')).toBeNull();
    expect(stripRestrictedFieldsDeep('string', 'PATIENT')).toBe('string');
    expect(stripRestrictedFieldsDeep(42, 'PATIENT')).toBe(42);
  });

  it('should filter deeply nested structures', () => {
    const data = {
      level1: {
        level2: {
          ssn: 'secret',
          safe: 'visible',
        },
      },
    };
    const result = stripRestrictedFieldsDeep(data, 'NURSE') as any;
    expect(result.level1.level2.ssn).toBeUndefined();
    expect(result.level1.level2.safe).toBe('visible');
  });

  it('should filter arrays', () => {
    const data = [
      { ssn: 'a', name: 'A' },
      { billingCode: 'b', name: 'B' },
    ];
    const result = stripRestrictedFieldsDeep(data, 'ASSISTANT') as any[];
    expect(result[0].ssn).toBeUndefined();
    expect(result[0].name).toBe('A');
    expect(result[1].billingCode).toBeUndefined();
    expect(result[1].name).toBe('B');
  });
});
