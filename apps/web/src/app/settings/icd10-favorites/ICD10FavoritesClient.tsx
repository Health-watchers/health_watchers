'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageWrapper,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  SearchInput,
  Spinner,
  ErrorMessage,
  EmptyState,
  SectionErrorBoundary,
} from '@/components/ui';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

interface Favorite {
  code: string;
  description: string;
  addedAt: string;
}

interface RecentCode {
  code: string;
  description: string;
  useCount: number;
  lastUsedAt: string;
}

interface SearchResult {
  code: string;
  description: string;
  isFavorite?: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`${API_URL}/api/v1/icd10${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = await res.json();
  return body.data as T;
}

export default function ICD10FavoritesClient() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  const favoritesQuery = useQuery({
    queryKey: ['icd10', 'favorites'],
    queryFn: () => getJson<Favorite[]>('/favorites'),
  });

  const recentQuery = useQuery({
    queryKey: ['icd10', 'recent'],
    queryFn: () => getJson<RecentCode[]>('/recent?limit=10'),
  });

  const searchQuery = useQuery({
    queryKey: ['icd10', 'search', query],
    queryFn: () => getJson<SearchResult[]>(`/search?q=${encodeURIComponent(query)}&limit=10`),
    enabled: query.trim().length > 0,
  });

  const addFavorite = useMutation({
    mutationFn: async (item: { code: string; description: string }) => {
      const res = await fetchWithAuth(`${API_URL}/api/v1/icd10/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to add favorite');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['icd10', 'favorites'] }),
  });

  const removeFavorite = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetchWithAuth(
        `${API_URL}/api/v1/icd10/favorites/${encodeURIComponent(code)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to remove favorite');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['icd10', 'favorites'] }),
  });

  const favoriteCodes = new Set((favoritesQuery.data ?? []).map((f) => f.code));

  return (
    <PageWrapper className="py-8">
      <PageHeader
        title="ICD-10 Favorites"
        subtitle="Save the codes your clinic uses most so they appear first when searching."
      />

      <SectionErrorBoundary name="ICD-10 favorites">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Add favorites */}
          <Card>
            <CardHeader>
              <CardTitle>Add a favorite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ICD-10 by code or description…"
                aria-label="Search ICD-10 codes"
              />
              {searchQuery.isFetching && <Spinner />}
              <ul className="divide-y divide-neutral-100">
                {(searchQuery.data ?? []).map((r) => (
                  <li key={r.code} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      <span className="font-mono font-semibold">{r.code}</span>{' '}
                      <span className="text-neutral-600">{r.description}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={favoriteCodes.has(r.code) || addFavorite.isPending}
                      onClick={() =>
                        addFavorite.mutate({ code: r.code, description: r.description })
                      }
                    >
                      {favoriteCodes.has(r.code) ? 'Added' : 'Add'}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Current favorites */}
          <Card>
            <CardHeader>
              <CardTitle>Current favorites</CardTitle>
            </CardHeader>
            <CardContent>
              {favoritesQuery.isLoading ? (
                <Spinner />
              ) : favoritesQuery.error ? (
                <ErrorMessage
                  message="Failed to load favorites."
                  onRetry={() => favoritesQuery.refetch()}
                />
              ) : (favoritesQuery.data ?? []).length === 0 ? (
                <EmptyState
                  title="No favorites yet"
                  description="Search on the left to add your most-used codes."
                />
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {favoritesQuery.data!.map((f) => (
                    <li key={f.code} className="flex items-center justify-between py-2">
                      <span className="text-sm">
                        <span className="font-mono font-semibold">{f.code}</span>{' '}
                        <span className="text-neutral-600">{f.description}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={removeFavorite.isPending}
                        onClick={() => removeFavorite.mutate(f.code)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recently used */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recently used</CardTitle>
          </CardHeader>
          <CardContent>
            {recentQuery.isLoading ? (
              <Spinner />
            ) : (recentQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No recent codes"
                description="Codes used on encounters will appear here."
              />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {recentQuery.data!.map((r) => (
                  <li key={r.code} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      <span className="font-mono font-semibold">{r.code}</span>{' '}
                      <span className="text-neutral-600">{r.description}</span>
                    </span>
                    <span className="text-xs text-neutral-400">used {r.useCount}×</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </SectionErrorBoundary>
    </PageWrapper>
  );
}
