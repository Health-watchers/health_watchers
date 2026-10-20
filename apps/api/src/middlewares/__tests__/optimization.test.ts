/**
 * Tests for request/response optimization — issue #1076
 */
import { PayloadOptimizer, payloadOptimizer } from '../../utils/payload-optimizer';
import { FieldSelector, fieldSelector } from '../../utils/field-selector';

describe('PayloadOptimizer (#1076)', () => {
  let optimizer: PayloadOptimizer;

  beforeEach(() => {
    optimizer = new PayloadOptimizer();
  });

  describe('optimizePayload', () => {
    it('should remove null fields', () => {
      const data = { id: '123', name: 'John', phone: null, address: null };
      const { data: result } = optimizer.optimizePayload(data, { removeNullFields: true });

      expect(result.id).toBe('123');
      expect(result.name).toBe('John');
      expect(result.phone).toBeUndefined();
      expect(result.address).toBeUndefined();
    });

    it('should remove empty arrays', () => {
      const data = { id: '123', prescriptions: [], notes: 'Has notes' };
      const { data: result } = optimizer.optimizePayload(data, {
        removeEmptyArrays: true,
        removeNullFields: false,
      });

      expect(result.id).toBe('123');
      expect(result.notes).toBe('Has notes');
      expect(result.prescriptions).toBeUndefined();
    });

    it('should preserve non-empty arrays', () => {
      const data = { id: '123', tags: ['urgent', 'follow-up'] };
      const { data: result } = optimizer.optimizePayload(data);

      expect(result.tags).toEqual(['urgent', 'follow-up']);
    });

    it('should return metrics with the optimized data', () => {
      const data = { id: '123', name: 'John', unused: null };
      const { data: result, metrics } = optimizer.optimizePayload(data);

      expect(result).toBeDefined();
      expect(metrics.originalSize).toBeGreaterThan(0);
      expect(metrics.optimizedSize).toBeGreaterThan(0);
      expect(metrics.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle nested objects', () => {
      const data = {
        patient: {
          id: '123',
          name: 'John',
          ssn: null,
          insurance: {
            provider: 'ACME',
            policyNumber: null,
          },
        },
      };

      const { data: result } = optimizer.optimizePayload(data, { removeNullFields: true });
      expect(result.patient.name).toBe('John');
      expect(result.patient.ssn).toBeUndefined();
      expect(result.patient.insurance.provider).toBe('ACME');
      expect(result.patient.insurance.policyNumber).toBeUndefined();
    });

    it('should handle arrays of objects', () => {
      const data = [
        { id: '1', value: 'a', extra: null },
        { id: '2', value: 'b', extra: null },
      ];

      const { data: result } = optimizer.optimizePayload(data, { removeNullFields: true });
      expect(result).toHaveLength(2);
      expect(result[0].extra).toBeUndefined();
      expect(result[1].extra).toBeUndefined();
    });

    it('should exclude specified fields', () => {
      const data = { id: '123', name: 'John', internalCode: 'ABC', notes: 'test' };
      const { data: result } = optimizer.optimizePayload(data, {
        excludeFields: ['internalCode'],
      });

      expect(result.id).toBe('123');
      expect(result.name).toBe('John');
      expect(result.internalCode).toBeUndefined();
    });
  });

  describe('getOptimizationRecommendations', () => {
    it('should recommend removing null fields when many are present', () => {
      const data: Record<string, any> = { id: '123' };
      // Add more than 10 null fields
      for (let i = 0; i < 15; i++) {
        data[`field${i}`] = null;
      }

      const recommendations = optimizer.getOptimizationRecommendations(data);
      expect(recommendations.some((r) => r.includes('null'))).toBe(true);
    });

    it('should recommend pagination for large payloads', () => {
      // Create a payload > 1MB
      const data = { largeField: 'x'.repeat(1100000) };
      const recommendations = optimizer.getOptimizationRecommendations(data);
      expect(recommendations.some((r) => r.includes('pagination') || r.includes('1MB'))).toBe(true);
    });
  });

  describe('singleton payloadOptimizer', () => {
    it('should be a PayloadOptimizer instance', () => {
      expect(payloadOptimizer).toBeInstanceOf(PayloadOptimizer);
    });
  });
});

describe('FieldSelector (#1076)', () => {
  let selector: FieldSelector;

  beforeEach(() => {
    selector = new FieldSelector();
    selector.registerFieldConfig('Encounter', {
      allowedFields: ['id', 'chiefComplaint', 'status', 'patientId', 'clinicId', 'soapNotes'],
      defaultFields: ['id', 'chiefComplaint', 'status'],
      restrictedFields: ['soapNotes'],
    });
  });

  describe('parseRequestedFields', () => {
    it('should parse comma-separated string', () => {
      const fields = selector.parseRequestedFields('id,chiefComplaint,status');
      expect(fields.has('id')).toBe(true);
      expect(fields.has('chiefComplaint')).toBe(true);
      expect(fields.has('status')).toBe(true);
    });

    it('should parse array input', () => {
      const fields = selector.parseRequestedFields(['id', 'status']);
      expect(fields.has('id')).toBe(true);
      expect(fields.has('status')).toBe(true);
    });

    it('should return empty set for undefined', () => {
      const fields = selector.parseRequestedFields(undefined);
      expect(fields.size).toBe(0);
    });
  });

  describe('buildMongooseProjection', () => {
    it('should build projection for requested fields', () => {
      const projection = selector.buildMongooseProjection(
        'Encounter',
        'id,chiefComplaint',
        undefined,
        'DOCTOR'
      );
      expect(projection.id).toBe(1);
      expect(projection.chiefComplaint).toBe(1);
    });

    it('should return empty projection for unknown model', () => {
      const projection = selector.buildMongooseProjection('Unknown', 'id');
      expect(Object.keys(projection)).toHaveLength(0);
    });

    it('should use default fields when none requested', () => {
      const projection = selector.buildMongooseProjection('Encounter');
      // Default fields should be included
      expect(projection.id).toBe(1);
      expect(projection.chiefComplaint).toBe(1);
      expect(projection.status).toBe(1);
    });
  });

  describe('validateRequestedFields', () => {
    it('should pass for valid fields', () => {
      const result = selector.validateRequestedFields('Encounter', 'id,status');
      expect(result.valid).toBe(true);
      expect(result.invalidFields).toHaveLength(0);
    });

    it('should fail for invalid fields', () => {
      const result = selector.validateRequestedFields('Encounter', 'id,invalidField');
      expect(result.valid).toBe(false);
      expect(result.invalidFields).toContain('invalidField');
    });
  });

  describe('singleton fieldSelector', () => {
    it('should be a FieldSelector instance', () => {
      expect(fieldSelector).toBeInstanceOf(FieldSelector);
    });
  });
});

describe('responseFilterMiddleware (#1076)', () => {
  it('should strip restricted fields based on role', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { responseFilterMiddleware } = require('../../middlewares/response-filter.middleware');

    const mockJson = jest.fn();
    const req: any = { user: { role: 'NURSE' } };
    const res: any = {
      json: mockJson,
    };
    const next = jest.fn();

    responseFilterMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();

    // Call the intercepted json function
    const data = { id: '123', billingCode: 'XYZ', policyNumber: '12345' };
    res.json(data);

    const [calledWith] = mockJson.mock.calls[0];
    // NURSE should not see billingCode (only DOCTOR and above)
    expect(calledWith.billingCode).toBeUndefined();
    // NURSE should see policyNumber
    expect(calledWith.policyNumber).toBe('12345');
  });

  it('should pass through for SUPER_ADMIN', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { responseFilterMiddleware } = require('../../middlewares/response-filter.middleware');

    const mockJson = jest.fn();
    const req: any = { user: { role: 'SUPER_ADMIN' } };
    const res: any = { json: mockJson };
    const next = jest.fn();

    responseFilterMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    // SUPER_ADMIN: json is not intercepted (next called without patching)
    // verify original json is untouched (no interception for SUPER_ADMIN)
    expect(res.json).toBe(mockJson); // json unchanged for SUPER_ADMIN
  });
});
