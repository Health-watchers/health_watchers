import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'expired';

export type AnonymizationLevel = 'minimal' | 'standard' | 'strict';

export interface ExportJob {
  _id: string;
  status: ExportJobStatus;
  requestedBy: string;
  cohortFilters: Record<string, unknown>;
  fields: string[];
  anonymizationLevel: AnonymizationLevel;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;
  progress?: number; // 0-100
  rowCount?: number;
  downloadUrl?: string;
  error?: string;
  /** Fields that will be removed or generalised, keyed by field name */
  fieldTransformations?: Record<string, 'removed' | 'generalised' | 'pseudonymised'>;
}

export interface ExportRequest {
  cohortFilters: {
    ageMin?: number;
    ageMax?: number;
    conditions?: string[];
    medications?: string[];
    dateFrom?: string;
    dateTo?: string;
    clinicId?: string;
  };
  fields: string[];
  anonymizationLevel: AnonymizationLevel;
}

export function useResearchExports() {
  return useQuery<ExportJob[]>({
    queryKey: queryKeys.researchExports.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/research/exports`);
      if (!res.ok) throw new Error(`Failed to load research exports (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
    refetchInterval: (query) => {
      // Poll every 5 s while any job is running / queued
      const jobs = query.state.data as ExportJob[] | undefined;
      const hasActive = jobs?.some((j) => j.status === 'running' || j.status === 'queued');
      return hasActive ? 5_000 : false;
    },
  });
}

export function useResearchExportJob(jobId: string) {
  return useQuery<ExportJob>({
    queryKey: queryKeys.researchExports.detail(jobId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/research/exports/${jobId}`);
      if (!res.ok) throw new Error(`Failed to load export job (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    refetchInterval: (query) => {
      const job = query.state.data as ExportJob | undefined;
      return job?.status === 'running' || job?.status === 'queued' ? 5_000 : false;
    },
    enabled: !!jobId,
  });
}

export function useRequestResearchExport() {
  const queryClient = useQueryClient();
  return useMutation<ExportJob, Error, ExportRequest>({
    mutationFn: async (req) => {
      const res = await fetchWithAuth(`${API_V1}/research/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`Failed to request export (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.researchExports.all });
    },
  });
}
