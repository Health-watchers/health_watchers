import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Patient } from '@health-watchers/types';
import { queryKeys } from '@/lib/queryKeys';
import { API_V1 } from '@/lib/api';

export interface EncounterResponse {
  id: string;
  patientId: string;
  chiefComplaint: string;
  status: string;
  notes?: string;
  diagnosis?: { code: string; description: string; isPrimary?: boolean }[];
  vitalSigns?: Record<string, unknown>;
  aiSummary?: string;
  createdAt: string;
}

export interface PaymentResponse {
  id: string;
  amount: string;
  assetCode?: string;
  status: string;
  txHash?: string;
  createdAt?: string;
}

export interface Allergy {
  _id: string;
  allergen: string;
  allergenType: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  onsetDate?: string;
  isActive: boolean;
}

export function usePatientDetail(patientId: string) {
  const queryClient = useQueryClient();

  const {
    data: patient,
    isLoading: patientLoading,
    error: patientError,
  } = useQuery<Patient>({
    queryKey: queryKeys.patients.detail(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}`);
      if (res.status === 404) throw new Error('404');
      if (!res.ok) throw new Error('Failed to load patient');
      const data = await res.json();
      return data.data;
    },
  });

  const {
    data: encounters = [],
    isLoading: encountersLoading,
    error: encountersError,
  } = useQuery<EncounterResponse[]>({
    queryKey: queryKeys.encounters.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/encounters/patient/${patientId}`);
      if (!res.ok) throw new Error('Failed to load encounters');
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const {
    data: payments = [],
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useQuery<PaymentResponse[]>({
    queryKey: queryKeys.payments.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/payments?patientId=${patientId}`);
      if (!res.ok) throw new Error('Failed to load payments');
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const { data: vitals = [], isLoading: vitalsLoading } = useQuery({
    queryKey: ['vitals', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/vitals`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/analytics`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: allergies = [],
    isLoading: allergiesLoading,
    refetch: refetchAllergies,
  } = useQuery<Allergy[]>({
    queryKey: ['allergies', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/allergies`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const invalidatePatient = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patientId) });
  const invalidateEncounters = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.encounters.byPatient(patientId) });
  const invalidatePayments = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.byPatient(patientId) });

  return {
    patient,
    patientLoading,
    patientError,
    encounters,
    encountersLoading,
    encountersError,
    payments,
    paymentsLoading,
    paymentsError,
    vitals,
    vitalsLoading,
    analytics,
    analyticsLoading,
    allergies,
    allergiesLoading,
    refetchAllergies,
    invalidatePatient,
    invalidateEncounters,
    invalidatePayments,
  };
}

export function useAllergyForm(patientId: string, refetchAllergies: () => void) {
  const [showAllergyForm, setShowAllergyForm] = useState(false);
  const [allergyForm, setAllergyForm] = useState({
    allergen: '',
    allergenType: 'drug',
    reaction: '',
    severity: 'mild',
  });
  const [allergySubmitting, setAllergySubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    setAllergySubmitting(true);
    try {
      const res = await fetch(`${API_V1}/patients/${patientId}/allergies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allergyForm),
      });
      if (!res.ok) throw new Error('Failed to add allergy');
      setShowAllergyForm(false);
      setAllergyForm({ allergen: '', allergenType: 'drug', reaction: '', severity: 'mild' });
      refetchAllergies();
      setToast({ message: 'Allergy recorded.', type: 'success' });
    } catch {
      setToast({ message: 'Failed to add allergy.', type: 'error' });
    } finally {
      setAllergySubmitting(false);
    }
  };

  return {
    showAllergyForm,
    setShowAllergyForm,
    allergyForm,
    setAllergyForm,
    allergySubmitting,
    handleAddAllergy,
    toast,
    setToast,
  };
}

export function useAiSummary(encounters: EncounterResponse[]) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLastRun, setAiLastRun] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleGenerateAI = async () => {
    if (!encounters.length) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API_V1.replace('/api/v1', '')}/api/v1/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounterId: encounters[0].id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'AI unavailable');
      setAiSummary(body.summary);
      setAiLastRun(new Date());
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'AI generation failed',
        type: 'error',
      });
    } finally {
      setAiLoading(false);
    }
  };

  return { aiSummary, aiLoading, aiLastRun, handleGenerateAI, toast, setToast };
}
