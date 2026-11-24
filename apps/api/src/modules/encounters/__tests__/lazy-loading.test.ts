/**
 * Tests for lazy loading implementation — issue #1075
 */
import { LazyLoader, lazyLoader } from '../../../utils/lazy-loader';

describe('LazyLoader (#1075)', () => {
  let loader: LazyLoader;

  beforeEach(() => {
    loader = new LazyLoader();
  });

  describe('registerLazyFields', () => {
    it('should register lazy fields for a collection', () => {
      loader.registerLazyFields('encounters', [
        { path: 'attendingDoctorId', model: 'User' },
        { path: 'patientId', model: 'Patient' },
      ]);

      const fields = loader.getLazyFields('encounters');
      expect(fields).toHaveLength(2);
      expect(fields[0].path).toBe('attendingDoctorId');
      expect(fields[1].path).toBe('patientId');
    });

    it('should return empty array for unregistered collections', () => {
      const fields = loader.getLazyFields('nonexistent');
      expect(fields).toEqual([]);
    });
  });

  describe('getBaseProjection', () => {
    beforeEach(() => {
      loader.registerLazyFields('encounters', [
        { path: 'attendingDoctorId', model: 'User' },
        { path: 'patientId', model: 'Patient' },
        { path: 'clinicId', model: 'Clinic' },
      ]);
    });

    it('should exclude lazy fields from base projection', () => {
      const projection = loader.getBaseProjection('encounters');
      expect(projection.attendingDoctorId).toBe(0);
      expect(projection.patientId).toBe(0);
      expect(projection.clinicId).toBe(0);
    });

    it('should include __v exclusion by default', () => {
      const projection = loader.getBaseProjection('encounters');
      expect(projection.__v).toBe(0);
    });

    it('should respect requested fields option', () => {
      const projection = loader.getBaseProjection('encounters', {
        fields: ['chiefComplaint', 'status'],
      });
      expect(projection.chiefComplaint).toBe(1);
      expect(projection.status).toBe(1);
    });

    it('should respect excludeFields option', () => {
      const projection = loader.getBaseProjection('encounters', {
        excludeFields: ['aiSummary', 'soapNotes'],
      });
      expect(projection.aiSummary).toBe(0);
      expect(projection.soapNotes).toBe(0);
    });
  });

  describe('createLazyReference', () => {
    it('should create a lazy reference marker', () => {
      const ref = loader.createLazyReference('patientId', 'patient-123', 'Patient');
      expect(ref.__lazyLoad).toBe(true);
      expect(ref.path).toBe('patientId');
      expect(ref.id).toBe('patient-123');
      expect(ref.model).toBe('Patient');
      expect(ref.loadedAt).toBeNull();
    });
  });

  describe('shouldLazyLoad', () => {
    it('should return true by default', () => {
      expect(loader.shouldLazyLoad('patientId', {})).toBe(true);
    });

    it('should return false when lazyLoad is explicitly false', () => {
      expect(loader.shouldLazyLoad('patientId', { lazyLoad: false })).toBe(false);
    });

    it('should return false when populate is true', () => {
      expect(loader.shouldLazyLoad('patientId', { populate: true })).toBe(false);
    });

    it('should return false when field is in requested fields list', () => {
      expect(loader.shouldLazyLoad('patientId', { fields: ['patientId', 'status'] })).toBe(false);
    });
  });

  describe('singleton lazyLoader', () => {
    it('should be a singleton instance', () => {
      expect(lazyLoader).toBeInstanceOf(LazyLoader);
    });
  });
});

describe('parseLazyLoadQuery middleware (#1075)', () => {
  it('should parse fields string into array', () => {
    const { parseLazyLoadQuery } = require('../../../middleware/lazy-load.middleware');

    const req: any = {
      query: { fields: 'id,chiefComplaint,status' },
    };
    const res: any = {};
    const next = jest.fn();

    parseLazyLoadQuery(req, res, next);

    expect(req.lazyLoadQuery.fields).toEqual(['id', 'chiefComplaint', 'status']);
    expect(next).toHaveBeenCalled();
  });

  it('should parse excludeFields string into array', () => {
    const { parseLazyLoadQuery } = require('../../../middleware/lazy-load.middleware');

    const req: any = {
      query: { excludeFields: 'aiSummary,patientNotes' },
    };
    const res: any = {};
    const next = jest.fn();

    parseLazyLoadQuery(req, res, next);

    expect(req.lazyLoadQuery.excludeFields).toEqual(['aiSummary', 'patientNotes']);
    expect(next).toHaveBeenCalled();
  });

  it('should default lazyLoad to true', () => {
    const { parseLazyLoadQuery } = require('../../../middleware/lazy-load.middleware');

    const req: any = { query: {} };
    const res: any = {};
    const next = jest.fn();

    parseLazyLoadQuery(req, res, next);

    expect(req.lazyLoadQuery.lazyLoad).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should set lazyLoad to false when explicitly disabled', () => {
    const { parseLazyLoadQuery } = require('../../../middleware/lazy-load.middleware');

    const req: any = { query: { lazyLoad: 'false' } };
    const res: any = {};
    const next = jest.fn();

    parseLazyLoadQuery(req, res, next);

    expect(req.lazyLoadQuery.lazyLoad).toBe(false);
    expect(next).toHaveBeenCalled();
  });
});
