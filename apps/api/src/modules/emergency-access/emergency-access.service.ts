/**
 * Break-the-glass emergency access (#1493).
 *
 * A clinician can justify time-limited access to a patient outside their care
 * team (the patient's clinic). Every grant alerts compliance officers in real
 * time, every access made under it is tagged in the audit log, and the grant
 * lands in the Compliance Center review queue.
 */
import { Types } from 'mongoose';
import { EmergencyAccessGrant, EmergencyAccessGrantModel } from './emergency-access.model';
import { RequestEmergencyAccessDto, ReviewEmergencyAccessDto } from './emergency-access.validation';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import { emitToClinic } from '@api/realtime/socket';
import logger from '@api/utils/logger';

/** Roles notified about, and able to review, emergency access */
export const COMPLIANCE_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'] as const;

type GrantDoc = EmergencyAccessGrant & { _id: Types.ObjectId };

export function isGrantActive(grant: Pick<GrantDoc, 'expiresAt' | 'endedAt'>, now = new Date()) {
  return !grant.endedAt && grant.expiresAt > now;
}

export function toGrantResponse(grant: GrantDoc, now = new Date()) {
  return {
    id: String(grant._id),
    userId: grant.userId,
    clinicId: String(grant.clinicId),
    patientId: grant.patientId,
    patientClinicId: String(grant.patientClinicId),
    reason: grant.reason,
    justification: grant.justification,
    grantedAt: grant.grantedAt,
    expiresAt: grant.expiresAt,
    endedAt: grant.endedAt ?? null,
    isActive: isGrantActive(grant, now),
    reviewStatus: grant.reviewStatus,
    reviewedBy: grant.reviewedBy ?? null,
    reviewedAt: grant.reviewedAt ?? null,
    reviewNotes: grant.reviewNotes ?? null,
  };
}

/** The caller's unexpired, un-ended grant for a patient, if any. */
export async function findActiveGrant(userId: string, patientId: string) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(patientId)) return null;
  return EmergencyAccessGrantModel.findOne({
    userId: new Types.ObjectId(userId),
    patientId: new Types.ObjectId(patientId),
    endedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: -1 })
    .lean<GrantDoc | null>();
}

export async function createGrant(params: {
  userId: string;
  clinicId: string;
  patientId: string;
  patientClinicId: string;
  input: RequestEmergencyAccessDto;
}): Promise<GrantDoc> {
  const grantedAt = new Date();
  const grant = await EmergencyAccessGrantModel.create({
    userId: new Types.ObjectId(params.userId),
    clinicId: new Types.ObjectId(params.clinicId),
    patientId: new Types.ObjectId(params.patientId),
    patientClinicId: new Types.ObjectId(params.patientClinicId),
    reason: params.input.reason,
    justification: params.input.justification,
    grantedAt,
    expiresAt: new Date(grantedAt.getTime() + params.input.durationMinutes * 60_000),
    reviewStatus: 'PENDING',
  });
  return grant.toObject() as GrantDoc;
}

/**
 * Alert compliance officers of both clinics involved (and super admins) in real time:
 * an in-app notification per officer plus a clinic-wide socket event for open
 * Compliance Center dashboards.
 */
export async function notifyComplianceOfficers(grant: GrantDoc): Promise<void> {
  try {
    const clinicIds = [...new Set([String(grant.patientClinicId), String(grant.clinicId)])];
    const [officers, requester] = await Promise.all([
      UserModel.find({
        isActive: true,
        _id: { $ne: grant.userId },
        $or: [
          { role: 'SUPER_ADMIN' },
          {
            role: 'CLINIC_ADMIN',
            clinicId: { $in: clinicIds.map((id) => new Types.ObjectId(id)) },
          },
        ],
      })
        .select('_id clinicId')
        .lean<{ _id: Types.ObjectId; clinicId: Types.ObjectId }[]>(),
      UserModel.findById(grant.userId).select('fullName role').lean<{
        fullName?: string;
        role?: string;
      } | null>(),
    ]);

    const who = requester?.fullName ?? 'A clinician';
    const minutes = Math.round((grant.expiresAt.getTime() - grant.grantedAt.getTime()) / 60_000);
    const payload = toGrantResponse(grant);

    await Promise.all(
      officers.map((officer) =>
        createNotification({
          userId: officer._id,
          clinicId: officer.clinicId,
          type: 'emergency_access',
          title: 'Emergency access granted',
          message: `${who} used break-the-glass access to a patient record for ${minutes} minutes (${grant.reason.replace(/_/g, ' ').toLowerCase()}). Review required.`,
          link: '/compliance?tab=emergency-access',
          metadata: { grantId: payload.id, patientId: String(grant.patientId) },
        })
      )
    );
    for (const clinicId of clinicIds) {
      emitToClinic(clinicId, 'emergency-access:granted', payload);
    }
  } catch (err) {
    // Alerting must never block emergency care; the grant is still audited and queued.
    logger.error({ err, grantId: String(grant._id) }, 'Failed to alert compliance officers');
  }
}

export async function endGrant(grantId: Types.ObjectId): Promise<GrantDoc | null> {
  return EmergencyAccessGrantModel.findOneAndUpdate(
    { _id: grantId, endedAt: { $exists: false } },
    { $set: { endedAt: new Date() } },
    { new: true }
  ).lean<GrantDoc | null>();
}

/** Compliance officers see grants touching their clinic; super admins see all. */
export function reviewScope(user: { role: string; clinicId: string }): Record<string, unknown> {
  if (user.role === 'SUPER_ADMIN') return {};
  const clinicId = new Types.ObjectId(user.clinicId);
  return { $or: [{ patientClinicId: clinicId }, { clinicId }] };
}

export async function listGrants(
  user: { role: string; clinicId: string },
  query: { status?: string; page: number; limit: number }
) {
  const filter: Record<string, unknown> = { ...reviewScope(user) };
  if (query.status) filter.reviewStatus = query.status;

  const [grants, total] = await Promise.all([
    EmergencyAccessGrantModel.find(filter)
      .sort({ grantedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('userId', 'fullName email role')
      .populate('patientId', 'systemId')
      .populate('reviewedBy', 'fullName')
      .lean<GrantDoc[]>(),
    EmergencyAccessGrantModel.countDocuments(filter),
  ]);
  return { grants, total };
}

export async function reviewGrant(
  grantId: string,
  reviewer: { userId: string; role: string; clinicId: string },
  input: ReviewEmergencyAccessDto
): Promise<GrantDoc | 'NOT_FOUND' | 'SELF_REVIEW'> {
  if (!Types.ObjectId.isValid(grantId)) return 'NOT_FOUND';
  const grant = await EmergencyAccessGrantModel.findOne({
    _id: new Types.ObjectId(grantId),
    ...reviewScope(reviewer),
  }).lean<GrantDoc | null>();
  if (!grant) return 'NOT_FOUND';
  if (String(grant.userId) === reviewer.userId) return 'SELF_REVIEW';

  const updated = await EmergencyAccessGrantModel.findByIdAndUpdate(
    grant._id,
    {
      $set: {
        reviewStatus: input.decision,
        reviewedBy: new Types.ObjectId(reviewer.userId),
        reviewedAt: new Date(),
        ...(input.notes ? { reviewNotes: input.notes } : {}),
      },
    },
    { new: true }
  ).lean<GrantDoc | null>();
  return updated ?? 'NOT_FOUND';
}
