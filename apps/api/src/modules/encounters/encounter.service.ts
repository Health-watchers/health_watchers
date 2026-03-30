import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Encounter, EncounterDocument } from './schemas/encounter.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';

interface PaginationQuery {
  page: number;
  limit: number;
  patientId?: string;
  status?: string;
  clinicId: string;
}

interface PaginatedResult {
  data: Encounter[];
  total: number;
}

@Injectable()
export class EncountersService {
  constructor(
    @InjectModel(Encounter.name) private encounterModel: Model<EncounterDocument>,
    @InjectModel(Patient.name) private patientModel: Model<PatientDocument>,
  ) {}

  // NEW: Paginated encounters with population
  async findAllPaginated(query: PaginationQuery): Promise<PaginatedResult> {
    const { page, limit, patientId, status, clinicId } = query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = { clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;

    // Get total count
    const total = await this.encounterModel.countDocuments(filter).exec();

    // Get paginated encounters with patient population
    const encounters = await this.encounterModel
      .find(filter)
      .populate({
        path: 'patientId',
        select: 'firstName lastName systemId', // Lean select
        model: Patient.name,
      })
      .sort({ createdAt: -1 }) // Descending
      .skip(skip)
      .limit(limit)
      .lean() // Optimize performance
      .exec();

    return { data: encounters, total };
  }

  // EXISTING METHODS...
}