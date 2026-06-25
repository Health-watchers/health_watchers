import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface EncounterDetails {
  id: string;
  patientName: string;
  patientMrn: string;
  doctor: string;
  status: string;
  chiefComplaint: string;
  diagnosis: string[];
  treatmentPlan: string;
  prescriptions: { name: string; dose: string; frequency: string }[];
  vitals: {
    bloodPressure: string;
    heartRate: string;
    temperature: string;
    spo2: string;
  };
  aiSummary?: string;
  followUpDate?: string;
  soapNotes?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  versionHistory?: {
    id: string;
    author: string;
    updatedAt: string;
    summary: string;
  }[];
  documents?: {
    id: string;
    title: string;
    type: string;
    url: string;
  }[];
  cosignatureStatus?: string;
}

export function useEncounter(id: string) {
  return useQuery<EncounterDetails>({
    queryKey: queryKeys.encounters.detail(id),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/encounters/${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      return data.data;
    },
    enabled: Boolean(id),
  });
}
