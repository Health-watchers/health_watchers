import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface PreAuth {
  _id: string;
  patientId: string;
  clinicId: string;
  encounterId?: string;
  procedureCode: string;
  estimatedAmount: string;
  insuranceProvider: string;
  preAuthNumber?: string;
  status: 'pending' | 'approved' | 'denied' | 'claimed' | 'reclaimed';
  claimableBalanceId?: string;
  approvedAt?: string;
  claimedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export function usePreAuths(status = 'pending') {
  return useQuery<PreAuth[]>({
    queryKey: queryKeys.preAuth.list(status),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth?status=${status}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function usePreAuth(id: string | null) {
  return useQuery<PreAuth>({
    queryKey: queryKeys.preAuth.detail(id!),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth/${id}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePreAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      patientId: string;
      encounterId?: string;
      procedureCode: string;
      estimatedAmount: string;
      insuranceProvider: string;
      patientPublicKey: string;
    }) => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Request failed (${res.status})`);
      }
      return (await res.json()).data as PreAuth;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.preAuth.all }),
  });
}

export function useApprovePreAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, preAuthNumber }: { id: string; preAuthNumber: string }) => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuthNumber }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Request failed (${res.status})`);
      }
      return (await res.json()).data as PreAuth;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.preAuth.all }),
  });
}

export function useClaimPreAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth/${id}/claim`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Request failed (${res.status})`);
      }
      return (await res.json()).data as PreAuth & { txHash: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.preAuth.all }),
  });
}

export function useDenyPreAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`${API_V1}/pre-auth/${id}/deny`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Request failed (${res.status})`);
      }
      return (await res.json()).data as PreAuth & { txHash: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.preAuth.all }),
  });
}
