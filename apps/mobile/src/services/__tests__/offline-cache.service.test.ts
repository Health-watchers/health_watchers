import { OfflineCacheService } from '../offline-cache.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiRemove: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('OfflineCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheAppointments', () => {
    it('stores appointments in AsyncStorage', async () => {
      const appointments = [
        { _id: '1', scheduledAt: '2024-01-15T10:00:00Z', doctorName: 'Dr. Smith' },
        { _id: '2', scheduledAt: '2024-01-16T14:00:00Z', doctorName: 'Dr. Jones' },
      ];

      await OfflineCacheService.cacheAppointments(appointments);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'appointments',
        JSON.stringify(appointments)
      );
    });
  });

  describe('getCachedAppointments', () => {
    it('retrieves cached appointments', async () => {
      const cached = [{ _id: '1', scheduledAt: '2024-01-15T10:00:00Z' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cached));

      const result = await OfflineCacheService.getCachedAppointments();

      expect(result).toEqual(cached);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('appointments');
    });

    it('returns empty array when no cache exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await OfflineCacheService.getCachedAppointments();

      expect(result).toEqual([]);
    });
  });

  describe('cacheEncounters', () => {
    it('stores encounters in AsyncStorage', async () => {
      const encounters = [
        { _id: '1', chiefComplaint: 'Headache', status: 'open' },
        { _id: '2', chiefComplaint: 'Fever', status: 'closed' },
      ];

      await OfflineCacheService.cacheEncounters(encounters);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'encounters',
        JSON.stringify(encounters)
      );
    });
  });

  describe('getCachedEncounters', () => {
    it('retrieves cached encounters', async () => {
      const cached = [{ _id: '1', chiefComplaint: 'Headache' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cached));

      const result = await OfflineCacheService.getCachedEncounters();

      expect(result).toEqual(cached);
    });

    it('returns empty array when no cache exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await OfflineCacheService.getCachedEncounters();

      expect(result).toEqual([]);
    });
  });

  describe('cacheLabResults', () => {
    it('stores lab results in AsyncStorage', async () => {
      const labResults = [
        { _id: '1', testName: 'CBC', result: 'Normal' },
        { _id: '2', testName: 'Glucose', result: '95 mg/dL' },
      ];

      await OfflineCacheService.cacheLabResults(labResults);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'labResults',
        JSON.stringify(labResults)
      );
    });
  });

  describe('getCachedLabResults', () => {
    it('retrieves cached lab results', async () => {
      const cached = [{ _id: '1', testName: 'CBC', result: 'Normal' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cached));

      const result = await OfflineCacheService.getCachedLabResults();

      expect(result).toEqual(cached);
    });
  });

  describe('clearCache', () => {
    it('removes all cached items', async () => {
      await OfflineCacheService.clearCache();

      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
        'appointments',
        'encounters',
        'labResults',
        'profile',
      ]);
    });
  });
});
