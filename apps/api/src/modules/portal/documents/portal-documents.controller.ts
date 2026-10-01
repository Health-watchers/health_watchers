/**
 * Portal Documents Controller (Issue #1431)
 *
 * On document upload:
 *   1. Creates in-app notifications for the patient's primary provider and
 *      all care-team members (DOCTOR / NURSE roles) in the same clinic.
 *   2. Emits a Socket.IO event to connected clinicians in the clinic room.
 *   3. Optionally queues an email, respecting per-user notification preferences
 *      (handled transparently by createNotification which checks preferences).
 */

import { Request, Response } from 'express';
import { validateUploadedFile } from './document-validation';
import { PortalDocumentModel } from './portal-document.model';
import { createNotification } from '@api/modules/notifications/notification.service';
import { emitToClinic } from '@api/realtime/socket';
import { UserModel } from '@api/modules/auth/models/user.model';
import { enqueueEmail } from '@api/utils/email-queue';
import logger from '@api/utils/logger';

const CARE_TEAM_ROLES = ['DOCTOR', 'NURSE'] as const;

/**
 * Find all care-team members (DOCTOR + NURSE) in the given clinic.
 * Excludes the uploading patient themselves.
 */
async function findCareTeamMembers(clinicId: string) {
  return UserModel.find({
    clinicId,
    role: { $in: CARE_TEAM_ROLES },
    isActive: true,
  })
    .select('_id fullName email preferences')
    .lean();
}

export async function uploadDocument(req: Request, res: Response) {
  const { patientId, clinicId } = req.user as any;
  const file = (req as any).file;

  if (!file) return res.status(400).json({ success: false, message: 'No file provided.' });

  const validation = validateUploadedFile(file.mimetype, file.size, file.originalname);
  if (!validation.valid)
    return res.status(400).json({ success: false, message: validation.reason });

  const { category = 'other', visibility = 'care_team' } = req.body;

  const doc = await PortalDocumentModel.create({
    patientId,
    clinicId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    category,
    visibility,
    storageKey: `portal/${patientId}/${Date.now()}_${file.originalname}`,
    uploadedAt: new Date(),
  });

  // ── Notify care team (Issue #1431) ──────────────────────────────────────────
  // Fire-and-forget — notification failures must not fail the upload response
  notifyCareTeam({
    clinicId: String(clinicId),
    patientId: String(patientId),
    docId: String(doc._id),
    fileName: file.originalname,
    category,
    visibility,
  }).catch((err) =>
    logger.error({ err }, '[portal-docs] Failed to dispatch document upload notifications')
  );

  // Mark the document as notified
  await PortalDocumentModel.findByIdAndUpdate(doc._id, {
    $set: { notifiedAt: new Date() },
  });

  return res.status(201).json({ success: true, data: doc });
}

interface NotifyCareTeamParams {
  clinicId: string;
  patientId: string;
  docId: string;
  fileName: string;
  category: string;
  visibility: string;
}

async function notifyCareTeam({
  clinicId,
  patientId,
  docId,
  fileName,
  category,
  visibility,
}: NotifyCareTeamParams): Promise<void> {
  // Only notify care team if visibility allows
  if (visibility === 'private') {
    logger.info({ docId }, '[portal-docs] Skipping notifications — document is private');
    return;
  }

  const careTeam = await findCareTeamMembers(clinicId);

  if (careTeam.length === 0) {
    logger.info({ clinicId, docId }, '[portal-docs] No care team members found to notify');
    return;
  }

  const documentLink = `/patients/${patientId}/documents/${docId}`;
  const notificationTitle = 'Patient Document Uploaded';
  const notificationMessage = `A patient uploaded a new document: "${fileName}" (${category}).`;

  // Create in-app notifications for each care team member
  await Promise.all(
    careTeam.map((member) =>
      createNotification({
        userId: String(member._id),
        clinicId,
        type: 'system',
        title: notificationTitle,
        message: notificationMessage,
        link: documentLink,
        metadata: {
          documentId: docId,
          patientId,
          fileName,
          category,
        },
      }).catch((err) =>
        logger.error(
          { err, userId: member._id },
          '[portal-docs] Failed to create in-app notification'
        )
      )
    )
  );

  // Emit Socket.IO event to all connected clinicians in the clinic room
  emitToClinic(clinicId, 'document:uploaded', {
    documentId: docId,
    patientId,
    fileName,
    category,
    link: documentLink,
    uploadedAt: new Date().toISOString(),
  });

  logger.info(
    { clinicId, docId, careTeamCount: careTeam.length },
    '[portal-docs] Care team notified of document upload'
  );

  // Optional email notification — only for members with emailNotifications enabled
  await Promise.all(
    careTeam
      .filter((m: any) => m.preferences?.emailNotifications !== false)
      .map((member: any) =>
        enqueueEmail({
          to: member.email,
          subject: notificationTitle,
          html: `
            <p>Hello ${member.fullName},</p>
            <p>A patient has uploaded a new document to their portal:</p>
            <ul>
              <li><strong>File:</strong> ${fileName}</li>
              <li><strong>Category:</strong> ${category}</li>
            </ul>
            <p><a href="${process.env.WEB_URL ?? ''}${documentLink}">View document →</a></p>
          `.trim(),
          text: `${notificationMessage} View at: ${process.env.WEB_URL ?? ''}${documentLink}`,
        }).catch((err) =>
          logger.error({ err, userId: member._id }, '[portal-docs] Failed to enqueue notification email')
        )
      )
  );
}

export async function listMyDocuments(req: Request, res: Response) {
  const { patientId } = req.user as any;
  const { category, limit = 50 } = req.query;

  const filter: any = { patientId, deletedAt: { $exists: false } };
  if (category) filter.category = category;

  const docs = await PortalDocumentModel.find(filter)
    .sort({ uploadedAt: -1 })
    .limit(Number(limit))
    .select('-storageKey');

  return res.json({ success: true, data: docs });
}
