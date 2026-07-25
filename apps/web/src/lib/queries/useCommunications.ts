import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { API_V1 } from '@/lib/api';

export interface CommunicationLog {
  _id: string;
  patientId: string;
  clinicId: string;
  sentBy: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'phone_call' | 'in_person';
  direction: 'outbound' | 'inbound';
  content: string;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  sentAt: string;
  relatedEncounterId?: string;
  createdAt: string;
}

export interface LogCommunicationInput {
  channel: CommunicationLog['channel'];
  direction: CommunicationLog['direction'];
  content: string;
  status: CommunicationLog['status'];
  sentAt: string;
  relatedEncounterId?: string;
}

interface PaginatedResponse<T> {
  status: string;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function usePatientCommunications(
  patientId: string,
  query?: { page?: number; limit?: number; channel?: string; direction?: string }
) {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.channel) params.set('channel', query.channel);
  if (query?.direction) params.set('direction', query.direction);

  return useQuery<PaginatedResponse<CommunicationLog>>({
    queryKey: queryKeys.communications.byPatient(patientId, query as Record<string, string>),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/communications?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch communications');
      return res.json();
    },
    enabled: !!patientId,
  });
}

export function useLogCommunication(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation<CommunicationLog, Error, LogCommunicationInput>({
    mutationFn: async (input) => {
      const res = await fetch(`${API_V1}/patients/${patientId}/communications`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to log communication');
      }
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.byPatient(patientId) });
    },
  });
}
