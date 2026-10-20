'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ICD10SearchResult {
  code: string;
  description: string;
  category?: string;
  chapter?: string;
  isFavorite?: boolean;
}

export interface ICD10Favorite {
  code: string;
  description: string;
  addedAt: string;
}

export interface ICD10RecentCode {
  code: string;
  description: string;
  useCount: number;
  lastUsedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const icd10Base = `${API_URL}/api/v1/icd10`;

async function icd10Get<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`${icd10Base}${path}`);
  if (!res.ok) throw new Error(`ICD-10 request failed (${res.status})`);
  const body = await res.json();
  return body.data as T;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const icd10Keys = {
  all: ['icd10'] as const,
  favorites: () => [...icd10Keys.all, 'favorites'] as const,
  recent: (limit?: number) => [...icd10Keys.all, 'recent', limit ?? 10] as const,
  search: (q: string) => [...icd10Keys.all, 'search', q] as const,
};

// ── Favorites ─────────────────────────────────────────────────────────────────

/** Returns the clinic's saved favorite codes (most-recently added first). */
export function useICD10Favorites() {
  return useQuery({
    queryKey: icd10Keys.favorites(),
    queryFn: () => icd10Get<ICD10Favorite[]>('/favorites'),
    staleTime: 5 * 60 * 1000, // 5 min — relatively stable data
  });
}

/** Mutation: add an ICD-10 code to the clinic's favorites. */
export function useAddICD10Favorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: { code: string; description: string }) => {
      const res = await fetchWithAuth(`${icd10Base}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to add favorite');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: icd10Keys.favorites() });
      // Also invalidate any cached searches so isFavorite flags refresh.
      queryClient.invalidateQueries({ queryKey: icd10Keys.all });
    },
  });
}

/** Mutation: remove an ICD-10 code from the clinic's favorites. */
export function useRemoveICD10Favorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetchWithAuth(
        `${icd10Base}/favorites/${encodeURIComponent(code)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to remove favorite');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: icd10Keys.favorites() });
      queryClient.invalidateQueries({ queryKey: icd10Keys.all });
    },
  });
}

// ── Recent codes ──────────────────────────────────────────────────────────────

/** Returns the clinic's recently-used ICD-10 codes (most recent first). */
export function useICD10Recent(limit = 10) {
  return useQuery({
    queryKey: icd10Keys.recent(limit),
    queryFn: () => icd10Get<ICD10RecentCode[]>(`/recent?limit=${limit}`),
    staleTime: 60 * 1000, // 1 min — changes on every encounter submission
  });
}

/** Mutation: record that the clinic used an ICD-10 code (fires-and-forgets). */
export function useRecordICD10Recent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: { code: string; description?: string }) => {
      const res = await fetchWithAuth(`${icd10Base}/recent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      // 204 No Content is the success response.
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to record recent code');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: icd10Keys.recent() });
    },
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

/** Search ICD-10 codes; the clinic's favorites surface first in results. */
export function useICD10Search(query: string) {
  return useQuery({
    queryKey: icd10Keys.search(query),
    queryFn: () =>
      icd10Get<ICD10SearchResult[]>(
        `/search?q=${encodeURIComponent(query)}&limit=10`
      ),
    enabled: query.trim().length >= 1,
    staleTime: 60 * 1000,
  });
}
