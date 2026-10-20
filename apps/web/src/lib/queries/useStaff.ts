import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { InviteStaffInput, StaffMember, StaffRole } from '@health-watchers/types';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface StaffFilters {
  q: string;
  role: StaffRole | '';
  isActive: 'true' | 'false' | '';
  page: number;
  limit: number;
}

export interface StaffListResponse {
  data: StaffMember[];
  meta: { total: number; page: number; limit: number; pages: number };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${API_V1}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body as T;
}

export function useStaffList(filters: StaffFilters, options: { enabled?: boolean } = {}) {
  return useQuery<StaffListResponse>({
    enabled: options.enabled ?? true,
    queryKey: queryKeys.staff.list({ ...filters }),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.q) params.set('q', filters.q);
      if (filters.role) params.set('role', filters.role);
      if (filters.isActive) params.set('isActive', filters.isActive);
      return request<StaffListResponse>(`/users?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

// ── Optimistic update helpers ─────────────────────────────────────────────────

type Snapshot = Array<[QueryKey, StaffListResponse | undefined]>;

/** Applies `patch` to the staff member in every cached list and returns a rollback snapshot. */
async function patchStaffInLists(
  qc: QueryClient,
  id: string,
  patch: Partial<StaffMember>
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: queryKeys.staff.lists() });
  const snapshot = qc.getQueriesData<StaffListResponse>({ queryKey: queryKeys.staff.lists() });
  qc.setQueriesData<StaffListResponse>({ queryKey: queryKeys.staff.lists() }, (old) =>
    old ? { ...old, data: old.data.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : old
  );
  return snapshot;
}

function rollback(qc: QueryClient, snapshot?: Snapshot) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStaffInput) =>
      request<{ data: StaffMember }>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useUpdateStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: StaffRole }) =>
      request(`/users/${id}`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onMutate: ({ id, role }) => patchStaffInLists(qc, id, { role }),
    onError: (_err, _vars, snapshot) => rollback(qc, snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

/** Deactivates (DELETE /users/:id) or reactivates (POST /users/:id/reactivate) a staff member. */
export function useSetStaffActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active
        ? request(`/users/${id}/reactivate`, { method: 'POST' })
        : request(`/users/${id}`, { method: 'DELETE' }),
    onMutate: ({ id, active }) => patchStaffInLists(qc, id, { isActive: active }),
    onError: (_err, _vars, snapshot) => rollback(qc, snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
}

export function useRevokeStaffSessions() {
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: { revoked: number } }>(`/users/${id}/revoke-sessions`, { method: 'POST' }),
  });
}

export function useForceStaffPasswordReset() {
  return useMutation({
    mutationFn: (id: string) => request(`/users/${id}/reset-password`, { method: 'POST' }),
  });
}
