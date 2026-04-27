import { EncounterModel } from './encounter.model';
import { paginate } from '../../utils/paginate';

interface EncounterQuery {
  page: number;
  limit: number;
  patientId?: string;
  status?: string;
  clinicId: string;
}

export async function findEncountersPaginated(query: EncounterQuery) {
  const { page, limit, patientId, status, clinicId } = query;
  const filter: Record<string, unknown> = { clinicId, isActive: true };
  if (patientId) filter.patientId = patientId;
  if (status) filter.status = status;
  return paginate(EncounterModel, filter, page, limit, { createdAt: -1 });
}
