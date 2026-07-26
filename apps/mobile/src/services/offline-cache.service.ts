import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from 'react-query';
import { authService } from './auth.service';

const CACHE_KEYS = {
  appointments: 'appointments',
  encounters: 'encounters',
  labResults: 'labResults',
  profile: 'profile',
};

export class OfflineCacheService {
  static async cacheAppointments(appointments: any[]): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.appointments, JSON.stringify(appointments));
  }

  static async getCachedAppointments(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.appointments);
    return cached ? JSON.parse(cached) : [];
  }

  static async cacheEncounters(encounters: any[]): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.encounters, JSON.stringify(encounters));
  }

  static async getCachedEncounters(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.encounters);
    return cached ? JSON.parse(cached) : [];
  }

  static async cacheLabResults(results: any[]): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.labResults, JSON.stringify(results));
  }

  static async getCachedLabResults(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.labResults);
    return cached ? JSON.parse(cached) : [];
  }

  static async clearCache(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(CACHE_KEYS));
  }
}

export function useAppointmentsWithCache() {
  const queryClient = useQueryClient();

  return useQuery(
    ['appointments'],
    async () => {
      try {
        const api = authService.getApiClient();
        const response = await api.get('/appointments');
        await OfflineCacheService.cacheAppointments(response.data.data);
        return response.data.data;
      } catch (error) {
        // Return cached data on error
        return OfflineCacheService.getCachedAppointments();
      }
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    }
  );
}

export function useEncountersWithCache() {
  return useQuery(
    ['encounters'],
    async () => {
      try {
        const api = authService.getApiClient();
        const response = await api.get('/encounters');
        await OfflineCacheService.cacheEncounters(response.data.data);
        return response.data.data;
      } catch (error) {
        return OfflineCacheService.getCachedEncounters();
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );
}
