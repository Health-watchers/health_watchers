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

export interface DeliveryStatusUpdate {
  status: ICommunicationLog['status'];
  deliveredAt?: Date;
  twilioMessageSid?: string;
  providerMessageId?: string;
}

export interface SystemLogInput {
  patientId: string;
  clinicId: string;
  channel: ICommunicationLog['channel'];
  direction?: ICommunicationLog['direction'];
  content: string;
  status?: ICommunicationLog['status'];
  sentAt?: Date;
  relatedEncounterId?: string;
  twilioMessageSid?: string;
  providerMessageId?: string;
  sentBy?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

  /**
   * Create a communication log entry from a system-initiated flow
   * (e.g. SMS OTP, appointment reminders). Does not require a request user.
   */
  async logSystemCommunication(params: SystemLogInput): Promise<ICommunicationLog> {
    const log = await CommunicationLogModel.create({
      patientId: params.patientId,
      clinicId: params.clinicId,
      sentBy: params.sentBy,
      channel: params.channel,
      direction: params.direction ?? 'OUTBOUND',
      content: params.content,
      status: params.status ?? 'SENT',
      sentAt: params.sentAt ?? new Date(),
      deliveredAt: undefined,
      readAt: undefined,
      relatedEncounterId: params.relatedEncounterId,
      twilioMessageSid: params.twilioMessageSid,
      providerMessageId: params.providerMessageId,
    });

    await auditLog({
      userId: params.sentBy,
      clinicId: params.clinicId,
      action: 'COMMUNICATION_LOG_CREATED',
      resourceType: 'CommunicationLog',
      resourceId: log._id.toString(),
      outcome: 'SUCCESS',
      metadata: {
        patientId: params.patientId,
        clinicId: params.clinicId,
        channel: params.channel,
      },
    });

    return log;
  }

  /**
   * Helper for SMS OTP flows: records the OTP SMS in the communication log.
   * The OTP code itself is never persisted in the log content.
   */
  async logSmsOtp(params: {
    patientId: string;
    clinicId: string;
    phoneNumber?: string;
    status?: ICommunicationLog['status'];
    sentAt?: Date;
    twilioMessageSid?: string;
    sentBy?: string;
  }): Promise<ICommunicationLog> {
    return this.logSystemCommunication({
      patientId: params.patientId,
      clinicId: params.clinicId,
      channel: 'SMS',
      direction: 'OUTBOUND',
      content: 'One-time passcode sent via SMS',
      status: params.status ?? 'SENT',
      sentAt: params.sentAt,
      twilioMessageSid: params.twilioMessageSid,
      sentBy: params.sentBy,
    });
  }

  /**
   * Helper for appointment reminder flows: records the reminder in the log.
   */
  async logAppointmentReminder(params: {
    patientId: string;
    clinicId: string;
    channel?: ICommunicationLog['channel'];
    content: string;
    relatedEncounterId?: string;
    status?: ICommunicationLog['status'];
    sentAt?: Date;
    twilioMessageSid?: string;
    providerMessageId?: string;
    sentBy?: string;
  }): Promise<ICommunicationLog> {
    return this.logSystemCommunication({
      patientId: params.patientId,
      clinicId: params.clinicId,
      channel: params.channel ?? 'SMS',
      direction: 'OUTBOUND',
      content: params.content,
      status: params.status ?? 'SENT',
      sentAt: params.sentAt,
      relatedEncounterId: params.relatedEncounterId,
      twilioMessageSid: params.twilioMessageSid,
      providerMessageId: params.providerMessageId,
      sentBy: params.sentBy,
    });
  }

  /**
   * Record a delivery status update from the notification provider.
   */
  async updateDeliveryStatus(
    logId: string,
    clinicId: string,
    update: DeliveryStatusUpdate
  ): Promise<ICommunicationLog | null> {
    const set: Record<string, unknown> = { status: update.status };

    if (update.deliveredAt) {
      set.deliveredAt = update.deliveredAt;
    } else if (update.status === 'DELIVERED') {
      set.deliveredAt = new Date();
    }

    if (update.twilioMessageSid) {
      set.twilioMessageSid = update.twilioMessageSid;
    }

    if (update.providerMessageId) {
      set.providerMessageId = update.providerMessageId;
    }

    return CommunicationLogModel.findOneAndUpdate(
      { _id: logId, clinicId },
      { $set: set },
      { new: true }
    );
  }

  /**
   * Record a delivery status update by provider message id (webhook callback).
   */
  async updateDeliveryStatusByProviderId(
    providerMessageId: string,
    update: DeliveryStatusUpdate
  ): Promise<ICommunicationLog | null> {
    const set: Record<string, unknown> = { status: update.status };

    if (update.deliveredAt) {
      set.deliveredAt = update.deliveredAt;
    } else if (update.status === 'DELIVERED') {
      set.deliveredAt = new Date();
    }

    if (update.twilioMessageSid) {
      set.twilioMessageSid = update.twilioMessageSid;
    }

    return CommunicationLogModel.findOneAndUpdate(
      { providerMessageId },
      { $set: set },
      { new: true }
    );
  }

  async markAsRead(
    logId: string,
    clinicId: string,
    user: RequestUser
  ): Promise<ICommunicationLog> {
    const log = await CommunicationLogModel.findOneAndUpdate(
      { _id: logId, clinicId },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!log) {
      throw new Error('Communication log not found');
    }

    await auditLog({
      userId: user._id,
      clinicId,
      action: 'COMMUNICATION_LOG_VIEWED',
      resourceType: 'CommunicationLog',
      resourceId: log._id.toString(),
      outcome: 'SUCCESS',
      metadata: {
        patientId: log.patientId?.toString(),
        clinicId,
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

    // Normalize pagination
    const page = Math.max(DEFAULT_PAGE, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));

    // Paginate
    const result = await paginate(CommunicationLogModel, filter, page, limit, {
      sentAt: -1,
    });

    // Audit log (omit content for privacy)
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
        total: result.pagination.total,
        page: result.pagination.page,
        limit: result.pagination.limit,
        totalPages: result.pagination.totalPages,
        hasNextPage: result.pagination.hasNextPage,
      },
    };
  }
}

export const communicationService = new CommunicationService();
