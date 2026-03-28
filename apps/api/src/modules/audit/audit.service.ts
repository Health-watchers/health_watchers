import { Request } from 'express';
import { Types } from 'mongoose';
import { AuditAction, AuditLogModel } from './audit.model';

interface AuditLogParams {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  userId?: string | Types.ObjectId;
  clinicId?: string | Types.ObjectId;
  outcome?: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, any>;
}

/**
 * Create an immutable audit log entry
 * @param params - Audit log parameters
 * @param req - Express request object (optional, for IP and user agent)
 */
export async function auditLog(params: AuditLogParams, req?: Request): Promise<void> {
  try {
    const ipAddress = req
      ? (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] as string ||
        req.socket.remoteAddress
      : undefined;

    const userAgent = req?.headers['user-agent'];

    await AuditLogModel.create({
      userId: params.userId ? new Types.ObjectId(params.userId) : undefined,
      clinicId: params.clinicId ? new Types.ObjectId(params.clinicId) : undefined,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress,
      userAgent,
      outcome: params.outcome || 'SUCCESS',
      metadata: params.metadata,
      timestamp: new Date(),
    });
  } catch (error) {
    // Log the error but don't throw - audit logging should not break the main flow
    console.error('Failed to create audit log:', error);
  }
}
