/**
 * Document audit trail writer — Issue #1247
 */
import { Types } from 'mongoose';
import type { Request } from 'express';
import { DocumentAuditModel, type DocumentAuditAction } from './models/document-audit.model';
import logger from '@api/utils/logger';

export async function recordDocumentAudit(params: {
  documentId: string | Types.ObjectId;
  clinicId: string | Types.ObjectId;
  actorId?: string | Types.ObjectId;
  action: DocumentAuditAction;
  outcome?: 'success' | 'denied' | 'error';
  req?: Request;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await DocumentAuditModel.create({
      documentId: new Types.ObjectId(String(params.documentId)),
      clinicId: new Types.ObjectId(String(params.clinicId)),
      actorId: params.actorId ? new Types.ObjectId(String(params.actorId)) : undefined,
      action: params.action,
      outcome: params.outcome ?? 'success',
      ip: params.req?.ip,
      userAgent: params.req?.headers['user-agent'],
      metadata: params.metadata,
    });
  } catch (err) {
    // Never let audit failures break the request path.
    logger.warn({ err, action: params.action }, 'document audit write failed');
  }
}
