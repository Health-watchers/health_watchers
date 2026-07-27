import { authService } from './auth.service';

export type DocumentRecord = {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  url?: string;
  ownerRole?: string;
};

export type CarePlan = {
  id: string;
  title: string;
  goal: string;
  intervention: string;
  assignee: string;
  progress: number;
  history: string[];
};

export type ImmunizationRecord = {
  id: string;
  vaccine: string;
  dueDate: string;
  administeredAt?: string;
};

async function getData<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await authService.getApiClient().get(path);
    return normalizeIds(response.data.data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

async function postData<T>(path: string, payload: T): Promise<T> {
  try {
    const response = await authService.getApiClient().post(path, payload);
    return normalizeIds(response.data.data ?? payload) as T;
  } catch {
    return payload;
  }
}

function normalizeIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeIds);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return { ...record, id: record.id ?? record._id };
  }
  return value;
}

export const HealthWorkflowsService = {
  listDocuments: async () => (await getData<any[]>('/documents', [])).map(toDocumentRecord),
  saveDocument: (document: DocumentRecord) => postData('/documents', document),
  listCarePlans: async () => (await getData<any[]>('/care-plans', [])).map(toCarePlan),
  saveCarePlan: (plan: CarePlan) => postData('/care-plans', plan),
  listImmunizations: async () =>
    (await getData<any[]>('/immunizations', [])).map(toImmunizationRecord),
  saveImmunization: (record: ImmunizationRecord) => postData('/immunizations', record),
};

function toDocumentRecord(record: any): DocumentRecord {
  return {
    id: String(record.id ?? record._id),
    name: record.name ?? record.fileName ?? 'Untitled document',
    type: record.type ?? record.documentType ?? record.mimeType ?? 'other',
    uploadedAt: record.uploadedAt ?? record.createdAt ?? new Date().toISOString(),
    url: record.url,
    ownerRole: record.ownerRole ?? 'authorized care team',
  };
}

function toCarePlan(record: any): CarePlan {
  return {
    id: String(record.id ?? record._id),
    title: record.title ?? record.condition ?? 'Care plan',
    goal: record.goal ?? record.goals?.[0]?.description ?? 'No goal recorded',
    intervention:
      record.intervention ?? record.interventions?.[0]?.description ?? 'No intervention recorded',
    assignee: record.assignee ?? 'Care team',
    progress: record.progress ?? (record.status === 'completed' ? 100 : 0),
    history: record.history ?? record.reviewHistory?.map((item: any) => item.notes) ?? [],
  };
}

function toImmunizationRecord(record: any): ImmunizationRecord {
  return {
    id: String(record.id ?? record._id),
    vaccine: record.vaccine ?? record.vaccineName ?? 'Immunization',
    dueDate:
      record.dueDate ?? record.expiryDate ?? record.administeredDate ?? new Date().toISOString(),
    administeredAt: record.administeredAt ?? record.administeredDate,
  };
}
