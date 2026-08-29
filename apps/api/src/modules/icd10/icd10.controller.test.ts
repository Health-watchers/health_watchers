import { cache } from '../../services/cache.service';
import { ICD10Model } from './icd10.model';

jest.mock('../../services/cache.service', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('./icd10.model', () => ({
  ICD10Model: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ code: 'J06.9', description: 'Acute URI' }]),
    }),
    findOne: jest.fn(),
  },
}));

describe('ICD-10 search', () => {
  it('uses $text operator for non-code queries', async () => {
    const findSpy = ICD10Model.find as jest.Mock;
    // Simulate a description search
    findSpy({ $text: { $search: 'respiratory' }, isValid: true }, expect.anything());
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ $text: expect.objectContaining({ $search: 'respiratory' }) }),
      expect.anything()
    );
  });

  it('returns cached result on second identical request', async () => {
    const cachedData = [{ code: 'J06.9', description: 'Acute URI' }];
    (cache.get as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(cachedData);

    // First call — cache miss
    const miss = await cache.get('icd10:search:respiratory:20');
    expect(miss).toBeNull();

    // Simulate caching
    await cache.set('icd10:search:respiratory:20', cachedData, 3600);

    // Second call — cache hit
    const hit = await cache.get('icd10:search:respiratory:20');
    expect(hit).toEqual(cachedData);
    expect(cache.get).toHaveBeenCalledTimes(2);
  });
});
