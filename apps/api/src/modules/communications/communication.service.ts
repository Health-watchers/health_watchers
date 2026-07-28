import { CommunicationLogModel, ICommunicationLog } from './communication-log.model';
import { LogCommunicationInput, ListCommunicationsQuery } from './communication.validation';
import { auditLog } from '../audit/audit.service';
import { paginate } from '../../utils/paginate';
import { PatientModel } from '../patients/models/patient.model';

export interface RequestUser {
  _id: string;
  clinicId: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

export class CommunicationService {
  async logCommunication(
    patientId: string,
    params: LogCommunicationInput,
    user: RequestUser
  ): Promise<ICommunicationLog> {
    // Verify patient exists and belongs to clinic
    const patient = await PatientModel.findOne({
      _id: patientId,
      clinicId: user.clinicId,
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Create communication log
    const log = await CommunicationLogModel.create({
      patientId,
      clinicId: user.clinicId,
      sentBy: user._id,
      channel: params.channel,
      direction: params.direction,
      content: params.content,
      status: params.status,
      sentAt: params.sentAt,
      deliveredAt: undefined,
      readAt: undefined,
      relatedEncounterId: params.relatedEncounterId,
      twilioMessageSid: params.twilioMessageSid,
    });

    // Audit log (omit content for privacy)
    await auditLog({
      userId: user._id,
      clinicId: user.clinicId,
      action: 'COMMUNICATION_LOG_CREATED',
      resourceType: 'CommunicationLog',
      resourceId: log._id.toString(),
      outcome: 'SUCCESS',
      metadata: {
        patientId,
        clinicId: user.clinicId,
      },
    });

    return log;
  }

  async listCommunications(
    patientId: string,
    clinicId: string,
    query: ListCommunicationsQuery
  ): Promise<PaginatedResult<ICommunicationLog>> {
    // Verify patient exists and belongs to clinic
    const patient = await PatientModel.findOne({
      _id: patientId,
      clinicId,
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Build filter
    const filter: Record<string, unknown> = {
      patientId,
      clinicId,
    };

    if (query.channel) {
      filter.channel = query.channel;
    }

    if (query.direction) {
      filter.direction = query.direction;
    }

    // Paginate
    const result = await paginate(CommunicationLogModel, filter, query.page, query.limit, {
      sentAt: -1,
    });

    // Audit log
    await auditLog({
      clinicId,
      action: 'COMMUNICATION_LOG_VIEWED',
      resourceType: 'CommunicationLog',
      outcome: 'SUCCESS',
      metadata: {
        patientId,
        clinicId,
      },
    });

    return {
      data: result.data,
      meta: {
        total: result.meta.total,
        page: result.meta.page,
        limit: result.meta.limit,
        totalPages: result.meta.totalPages,
        hasNextPage: result.meta.hasNextPage,
      },
    };
  }
}

export const communicationService = new CommunicationService();
