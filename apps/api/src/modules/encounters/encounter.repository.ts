import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';

import { Encounter, EncounterDocument } from './encounter.schema';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EncounterCreateData {
  clinicId: string;
  patientId: string;
  [key: string]: unknown;
}

export interface EncounterUpdateData {
  [key: string]: unknown;
}

@Injectable()
export class EncounterRepository {
  constructor(
    @InjectModel(Encounter.name)
    private readonly encounterModel: Model<EncounterDocument>,
  ) {}

  /**
   * Find a single active encounter by id, scoped to a clinic.
   */
  async findById(
    id: string,
    clinicId: string,
  ): Promise<EncounterDocument | null> {
    return this.encounterModel
      .findOne({ _id: id, clinicId, isActive: true })
      .exec();
  }

  /**
   * Find active encounters for a patient, scoped to a clinic, with pagination.
   */
  async findByPatient(
    patientId: string,
    clinicId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<EncounterDocument>> {
    const filter: FilterQuery<EncounterDocument> = {
      patientId,
      clinicId,
      isActive: true,
    };
    return this.paginate(filter, options);
  }

  /**
   * Find active encounters for a clinic, with pagination.
   */
  async findByClinic(
    clinicId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<EncounterDocument>> {
    const filter: FilterQuery<EncounterDocument> = {
      clinicId,
      isActive: true,
    };
    return this.paginate(filter, options);
  }

  /**
   * Create a new encounter.
   */
  async create(data: EncounterCreateData): Promise<EncounterDocument> {
    const created = new this.encounterModel({
      ...data,
      isActive: true,
    });
    return created.save();
  }

  /**
   * Update an active encounter by id, scoped to a clinic.
   * Returns the updated document, or null if not found.
   */
  async update(
    id: string,
    clinicId: string,
    data: EncounterUpdateData,
    options: QueryOptions = { new: true },
  ): Promise<EncounterDocument | null> {
    const update: UpdateQuery<EncounterDocument> = { $set: data };
    return this.encounterModel
      .findOneAndUpdate(
        { _id: id, clinicId, isActive: true },
        update,
        { new: true, ...options },
      )
      .exec();
  }

  /**
   * Soft delete an active encounter by id, scoped to a clinic.
   * Returns the soft-deleted document, or null if not found.
   */
  async softDelete(
    id: string,
    clinicId: string,
  ): Promise<EncounterDocument | null> {
    return this.encounterModel
      .findOneAndUpdate(
        { _id: id, clinicId, isActive: true },
        { $set: { isActive: false, deletedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  /**
   * Shared pagination helper preserving existing clinicId/isActive scoping.
   */
  private async paginate(
    filter: FilterQuery<EncounterDocument>,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<EncounterDocument>> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const sort = options.sort ?? { createdAt: -1 };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.encounterModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.encounterModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }
}