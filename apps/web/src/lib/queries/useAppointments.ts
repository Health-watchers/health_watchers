import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no-show'
  | 'patient_arrived';

export interface Appointment {
  _id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  status: AppointmentStatus;
  chiefComplaint?: string;
  isTelemedicine?: boolean;
  videoRoomUrl?: string;
}

export interface AppointmentFilters {
  startDate?: string;
  endDate?: string;
  doctorId?: string;
  status?: AppointmentStatus;
}

export interface AppointmentDraft {
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  isTelemedicine?: boolean;
  chiefComplaint?: string;
}

export function useAppointments(filters: AppointmentFilters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.doctorId) params.set('doctorId', filters.doctorId);
  if (filters.status) params.set('status', filters.status);
  const filterRecord = Object.fromEntries(params.entries());

  return useQuery<Appointment[]>({
    queryKey: queryKeys.appointments.list(filterRecord),
    queryFn: async () => {
      const url = params.toString()
        ? `${API_V1}/appointments?${params.toString()}`
        : `${API_V1}/appointments`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error(`Failed to load appointments (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation<Appointment, Error, AppointmentDraft>({
    mutationFn: async (draft) => {
      const res = await fetchWithAuth(`${API_V1}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`Failed to create appointment (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation<Appointment, Error, { id: string; status: AppointmentStatus }>({
    mutationFn: async ({ id, status }) => {
      const res = await fetchWithAuth(`${API_V1}/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Failed to update appointment status (${res.status})`);
      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}
