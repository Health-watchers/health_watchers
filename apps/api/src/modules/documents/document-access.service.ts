/**
 * Document access control — Issue #1247
 *
 * Decision order for a given (user, document):
 *   1. Different clinic                      -> deny
 *   2. Soft-deleted / expired                -> deny (except clinic admins reading metadata)
 *   3. accessLevel = 'clinic'                -> allow any same-clinic user
 *   4. accessLevel = 'restricted'            -> allow if role in allowedRoles,
 *                                              or user in allowedUserIds,
 *                                              or an unexpired grant exists,
 *                                              or user is an admin / the uploader
 *   5. accessLevel = 'private'               -> uploader, admins, explicit grants only
 */
import { Types } from 'mongoose';
import type { PatientDocument } from './models/document.model';
import {
  DocumentAccessGrantModel,
  type DocumentPermission,
} from './models/document-access-grant.model';

export interface AccessSubject {
  userId: string;
  role: string;
  clinicId: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  via: 'clinic' | 'role' | 'allowlist' | 'grant' | 'owner' | 'admin' | 'denied';
}

const ADMIN_ROLES = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN']);

type DocLike = Pick<
  PatientDocument,
  | 'clinicId'
  | 'uploadedBy'
  | 'accessLevel'
  | 'allowedRoles'
  | 'allowedUserIds'
  | 'status'
  | 'expiresAt'
> & { _id: Types.ObjectId | string };

export async function evaluateAccess(
  subject: AccessSubject,
  doc: DocLike,
  permission: DocumentPermission = 'read'
): Promise<AccessDecision> {
  if (String(doc.clinicId) !== String(subject.clinicId)) {
    return { allowed: false, reason: 'document belongs to another clinic', via: 'denied' };
  }

  const isAdmin = ADMIN_ROLES.has(subject.role);
  const isOwner = String(doc.uploadedBy) === String(subject.userId);
  const lifecycleBlocked =
    doc.status === 'deleted' ||
    doc.status === 'expired' ||
    (doc.expiresAt ? new Date(doc.expiresAt).getTime() <= Date.now() : false);

  if (lifecycleBlocked && !(isAdmin && permission === 'read')) {
    return { allowed: false, reason: `document ${doc.status ?? 'expired'}`, via: 'denied' };
  }

  if (isAdmin) return { allowed: true, reason: 'clinic administrator', via: 'admin' };
  if (isOwner) return { allowed: true, reason: 'document owner', via: 'owner' };

  const level = doc.accessLevel ?? 'clinic';

  if (level === 'clinic' && permission === 'read') {
    return { allowed: true, reason: 'clinic-wide document', via: 'clinic' };
  }

  if (level === 'restricted') {
    if (permission === 'read' && (doc.allowedRoles ?? []).includes(subject.role)) {
      return { allowed: true, reason: 'role on allow-list', via: 'role' };
    }
    if ((doc.allowedUserIds ?? []).some((id) => String(id) === String(subject.userId))) {
      return { allowed: true, reason: 'user on allow-list', via: 'allowlist' };
    }
  }

  const grant = await DocumentAccessGrantModel.findOne({
    documentId: new Types.ObjectId(String(doc._id)),
    userId: new Types.ObjectId(subject.userId),
    revokedAt: { $exists: false },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  })
    .select('permission')
    .lean();

  if (grant && (grant.permission === 'write' || permission === 'read')) {
    return { allowed: true, reason: 'explicit grant', via: 'grant' };
  }

  return { allowed: false, reason: 'no matching access rule', via: 'denied' };
}

/** Ids of documents the user may read via an explicit grant (for search scoping). */
export async function grantedDocumentIds(
  userId: string,
  clinicId: string
): Promise<Types.ObjectId[]> {
  const grants = await DocumentAccessGrantModel.find({
    userId: new Types.ObjectId(userId),
    clinicId: new Types.ObjectId(clinicId),
    revokedAt: { $exists: false },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  })
    .select('documentId')
    .lean();
  return grants.map((g) => g.documentId as Types.ObjectId);
}
