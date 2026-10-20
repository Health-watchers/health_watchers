'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export interface Appointment {
  _id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no-show' | 'patient_arrived';
  chiefComplaint?: string;
  isTelemedicine?: boolean;
  videoRoomUrl?: string;
}

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  isTelemedicine: boolean;
  chiefComplaint?: string;
}

export interface RescheduleInput {
  appointmentId: string;
  scheduledAt: string;
}

/**
 * Fetch appointments for a date range, optionally filtered by doctor.
 */
export function useAppointments(dateFrom: string, dateTo: string, doctorId?: string) {
  return useQuery({
    queryKey: queryKeys.appointments.list({
      dateFrom,
      dateTo,
      ...(doctorId ? { doctorId } : {}),
    }),
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo, limit: '200' });
      if (doctorId) params.set('doctorId', doctorId);
      const data = await apiV1Fetch(`/appointments?${params}`);
      return (data.data ?? []) as Appointment[];
    },
  });
}

/**
 * Create a new appointment.
 */
export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAppointmentInput) => {
      const data = await apiV1Fetch('/appointments', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return (data.data ?? data) as Appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

/**
 * Reschedule an appointment to a new date/time.
 */
export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appointmentId, scheduledAt }: RescheduleInput) => {
      const data = await apiV1Fetch(
        `/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
        {
          method: 'PATCH',
          body: JSON.stringify({ scheduledAt }),
        },
      );
      return (data.data ?? data) as Appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

/**
 * Cancel an appointment (sets status to cancelled).
 */
export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const data = await apiV1Fetch(
        `/appointments/${encodeURIComponent(appointmentId)}/cancel`,
        { method: 'PATCH' },
      );
      return (data.data ?? data) as Appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

/**
 * Patch an appointment (general update — used for drag-and-drop reschedule).
 */
export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      appointmentId,
      patch,
    }: {
      appointmentId: string;
      patch: Partial<CreateAppointmentInput>;
    }) => {
      const data = await apiV1Fetch(`/appointments/${encodeURIComponent(appointmentId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return (data.data ?? data) as Appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}
