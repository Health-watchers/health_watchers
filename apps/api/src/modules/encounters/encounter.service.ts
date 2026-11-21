import { EncounterRepository } from './encounter.repository';
import { paginate } from '../../utils/paginate';

interface EncounterQuery {
  page: number;
  limit: number;
  patientId?: string;
  status?: string;
  clinicId: string;
}

interface EncounterUser {
  id: string;
  role: string;
}

interface CreateEncounterInput {
  clinicId: string;
  patientId: string;
  doctorId: string;
  status?: string;
  icd10Codes?: string[];
  [key: string]: unknown;
}

interface UpdateEncounterInput {
  status?: string;
  icd10Codes?: string[];
  [key: string]: unknown;
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const ICD10_PATTERN = /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;

export class EncounterService {
  constructor(
    private readonly repository: EncounterRepository,
    private readonly emitEvent: (event: string, payload: unknown) => void = () => {},
  ) {}

  private validateIcd10Codes(codes?: string[]): void {
    if (!codes) return;
    for (const code of codes) {
      if (!ICD10_PATTERN.test(code)) {
        throw new Error(`Invalid ICD-10 code: ${code}`);
      }
    }
  }

  private assertDoctorOwnsEncounter(encounter: { doctorId: string }, user: EncounterUser): void {
    if (user.role === 'DOCTOR' && encounter.doctorId !== user.id) {
      throw new Error('Forbidden: doctor does not own this encounter');
    }
  }

  private assertValidStatusTransition(from: string, to: string): void {
    const allowed = VALID_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid status transition from ${from} to ${to}`);
    }
  }

  async findEncountersPaginated(query: EncounterQuery) {
    const { page, limit, patientId, status, clinicId } = query;
    const filter: Record<string, unknown> = { clinicId, isActive: true };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    return this.repository.findByClinic(clinicId, filter, page, limit);
  }

  async getEncounter(id: string, user: EncounterUser) {
    const encounter = await this.repository.findById(id);
    if (!encounter) {
      throw new Error('Encounter not found');
    }
    this.assertDoctorOwnsEncounter(encounter, user);
    return encounter;
  }

  async listByPatient(patientId: string, clinicId: string, page: number, limit: number) {
    return this.repository.findByPatient(patientId, clinicId, page, limit);
  }

  async createEncounter(input: CreateEncounterInput, user: EncounterUser) {
    if (user.role === 'DOCTOR' && input.doctorId !== user.id) {
      throw new Error('Forbidden: doctor cannot create encounter for another doctor');
    }
    this.validateIcd10Codes(input.icd10Codes);
    const encounter = await this.repository.create({
      ...input,
      status: input.status ?? 'draft',
    });
    this.emitEvent('encounter.created', encounter);
    return encounter;
  }

  async updateEncounter(id: string, input: UpdateEncounterInput, user: EncounterUser) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Encounter not found');
    }
    this.assertDoctorOwnsEncounter(existing, user);
    if (input.status && input.status !== existing.status) {
      this.assertValidStatusTransition(existing.status, input.status);
    }
    this.validateIcd10Codes(input.icd10Codes);
    const updated = await this.repository.update(id, input);
    this.emitEvent('encounter.updated', updated);
    return updated;
  }

  async softDeleteEncounter(id: string, user: EncounterUser) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Encounter not found');
    }
    this.assertDoctorOwnsEncounter(existing, user);
    const deleted = await this.repository.softDelete(id);
    this.emitEvent('encounter.deleted', { id });
    return deleted;
  }
}

export { paginate };