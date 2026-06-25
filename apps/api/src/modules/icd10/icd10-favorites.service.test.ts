/**
 * Unit tests for the ICD-10 favorites/recent service. The Mongoose models are
 * mocked — no real DB.
 */

jest.mock('./clinic-icd10-favorites.model', () => ({
  ClinicICD10FavoritesModel: { findOne: jest.fn(), updateOne: jest.fn() },
}));

jest.mock('./clinic-icd10-recent.model', () => ({
  ClinicICD10RecentModel: { updateOne: jest.fn(), find: jest.fn() },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { ClinicICD10FavoritesModel } from './clinic-icd10-favorites.model';
import { ClinicICD10RecentModel } from './clinic-icd10-recent.model';
import {
  getFavoriteCodes,
  listFavorites,
  addFavorite,
  removeFavorite,
  recordRecentUsage,
  listRecent,
} from './icd10-favorites.service';

const favFindOne = ClinicICD10FavoritesModel.findOne as jest.Mock;
const favUpdateOne = ClinicICD10FavoritesModel.updateOne as jest.Mock;
const recentUpdateOne = ClinicICD10RecentModel.updateOne as jest.Mock;
const recentFind = ClinicICD10RecentModel.find as jest.Mock;

const CLINIC = 'clinic1';

beforeEach(() => {
  jest.clearAllMocks();
  favUpdateOne.mockResolvedValue({ acknowledged: true });
  recentUpdateOne.mockResolvedValue({ acknowledged: true });
});

function mockFavorites(codes: unknown[]) {
  favFindOne.mockReturnValue({ lean: () => Promise.resolve(codes.length ? { codes } : null) });
}

describe('getFavoriteCodes', () => {
  it('returns the codes for a clinic', async () => {
    mockFavorites([{ code: 'J06.9', description: 'a', addedAt: new Date() }]);
    expect(await getFavoriteCodes(CLINIC)).toEqual(['J06.9']);
  });

  it('returns an empty array when the clinic has no favorites', async () => {
    mockFavorites([]);
    expect(await getFavoriteCodes(CLINIC)).toEqual([]);
  });
});

describe('listFavorites', () => {
  it('sorts favorites most-recently-added first', async () => {
    mockFavorites([
      { code: 'A00', description: 'old', addedAt: new Date('2026-01-01') },
      { code: 'B00', description: 'new', addedAt: new Date('2026-05-01') },
    ]);
    const result = await listFavorites(CLINIC);
    expect(result.map((f) => f.code)).toEqual(['B00', 'A00']);
  });
});

describe('addFavorite', () => {
  it('upserts the clinic doc then pushes the code only when absent', async () => {
    mockFavorites([{ code: 'J06.9', description: 'a', addedAt: new Date() }]);
    await addFavorite(CLINIC, 'j06.9', 'Acute URI', 'user1');

    // First call: ensure the clinic doc exists
    expect(favUpdateOne).toHaveBeenNthCalledWith(
      1,
      { clinicId: CLINIC },
      { $setOnInsert: { clinicId: CLINIC, codes: [] } },
      { upsert: true }
    );
    // Second call: conditional push guarded by 'codes.code' $ne (no duplicates),
    // with the code uppercased.
    const [filter, update] = favUpdateOne.mock.calls[1];
    expect(filter).toEqual({ clinicId: CLINIC, 'codes.code': { $ne: 'J06.9' } });
    expect(update.$push.codes.code).toBe('J06.9');
    expect(update.$push.codes.description).toBe('Acute URI');
  });
});

describe('removeFavorite', () => {
  it('pulls the uppercased code', async () => {
    mockFavorites([]);
    await removeFavorite(CLINIC, 'j06.9');
    expect(favUpdateOne).toHaveBeenCalledWith(
      { clinicId: CLINIC },
      { $pull: { codes: { code: 'J06.9' } } }
    );
  });
});

describe('recordRecentUsage', () => {
  it('upserts with an incremented use count and refreshed timestamp', async () => {
    await recordRecentUsage(CLINIC, 'e11.9', 'Diabetes');
    const [filter, update, opts] = recentUpdateOne.mock.calls[0];
    expect(filter).toEqual({ clinicId: CLINIC, code: 'E11.9' });
    expect(update.$inc).toEqual({ useCount: 1 });
    expect(update.$set.description).toBe('Diabetes');
    expect(opts).toEqual({ upsert: true });
  });

  it('never throws when the DB write fails', async () => {
    recentUpdateOne.mockRejectedValueOnce(new Error('db down'));
    await expect(recordRecentUsage(CLINIC, 'E11.9')).resolves.toBeUndefined();
  });
});

describe('listRecent', () => {
  it('queries by clinic ordered by recency and clamps the limit', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ code: 'E11.9' }]),
    };
    recentFind.mockReturnValue(chain);

    const result = await listRecent(CLINIC, 5);
    expect(recentFind).toHaveBeenCalledWith({ clinicId: CLINIC });
    expect(chain.sort).toHaveBeenCalledWith({ lastUsedAt: -1 });
    expect(chain.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual([{ code: 'E11.9' }]);
  });
});
