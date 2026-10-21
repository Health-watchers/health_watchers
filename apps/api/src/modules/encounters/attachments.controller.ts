import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { EncounterModel } from './encounter.model';
import { uploadFile, deleteFile, getDownloadUrl } from '../documents/storage.service';
import { randomUUID } from 'crypto';
import logger from '@api/utils/logger';
import multer from 'multer';
import { paginate } from '@api/utils/pagination';
import { AuditLogModel } from '../audit/audit.model';

const router = Router({ mergeParams: true });
router.use(authenticate);

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const ALLOWED_TYPES = ['PDF', 'JPEG', 'PNG', 'DICOM'];
const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/dicom': 'DICOM',
};

const EXTENSION_MAP: Record<string, string> = {
  pdf: 'PDF',
  jpg: 'JPEG',
  jpeg: 'JPEG',
  png: 'PNG',
  dcm: 'DICOM',
};

const ALLOWED_ROLES = ['DOCTOR', 'NURSE', 'CLINIC_ADMIN'];

function getMimeType(mimeType: string): string | null {
  return MIME_TYPE_MAP[mimeType] || null;
}

function getExtensionType(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? EXTENSION_MAP[ext] || null : null;
}

/**
 * Virus scanning stub. In production this should delegate to ClamAV or a
 * similar scanning service. Returns true when the buffer is clean.
 */
async function scanForViruses(buffer: Buffer): Promise<boolean> {
  // Basic heuristic stub: reject empty buffers and known EICAR test signature.
  if (!buffer || buffer.length === 0) {
    return false;
  }
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  if (buffer.toString('latin1').includes(eicar)) {
    return false;
  }
  return true;
}

function sanitizeAttachment(attachment: any) {
  const { storageKey, ...rest } = attachment.toObject ? attachment.toObject() : attachment;
  return rest;
}

function hasRole(req: Request): boolean {
  const role = req.user?.role;
  return !!role && ALLOWED_ROLES.includes(role);
}

async function loadEncounterForClinic(req: Request, res: Response, encounterId: string) {
  const encounter = await EncounterModel.findById(encounterId);
  if (!encounter || encounter.clinicId.toString() !== req.user!.clinicId.toString()) {
    res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    return null;
  }
  return encounter;
}

// POST /api/v1/encounters/:encounterId/attachments
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId } = req.params;
    const file = req.file;

    if (!hasRole(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    if (!file) {
      return res.status(400).json({ error: 'BadRequest', message: 'No file provided' });
    }

    const mimeType = getMimeType(file.mimetype);
    const extensionType = getExtensionType(file.originalname);
    if (!mimeType || !extensionType || mimeType !== extensionType || !ALLOWED_TYPES.includes(mimeType)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      });
    }
    const fileType = mimeType;

    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'BadRequest', message: 'File size exceeds 20MB limit' });
    }

    const encounter = await loadEncounterForClinic(req, res, encounterId);
    if (!encounter) {
      return;
    }

    try {
      const isClean = await scanForViruses(file.buffer);
      if (!isClean) {
        logger.warn({ encounterId, fileName: file.originalname }, 'Attachment failed virus scan');
        return res.status(400).json({ error: 'BadRequest', message: 'File failed virus scan' });
      }

      const fileId = randomUUID();
      const storageKey = `encounters/${encounterId}/attachments/${fileId}`;

      await uploadFile({
        storageKey,
        buffer: file.buffer,
        mimeType: file.mimetype,
        encrypt: true,
      });

      const category = typeof req.body?.category === 'string' ? req.body.category : undefined;

      const attachment = {
        fileId,
        fileName: file.originalname,
        fileType: fileType as 'PDF' | 'JPEG' | 'PNG' | 'DICOM',
        fileSize: file.size,
        uploadedBy: req.user!.userId,
        uploadedAt: new Date(),
        storageKey,
        category,
      };

      encounter.attachments = encounter.attachments || [];
      encounter.attachments.push(attachment as any);
      await encounter.save();

      logger.info({ encounterId, fileId }, 'Attachment uploaded');

      return res.status(201).json({ status: 'success', data: sanitizeAttachment(attachment) });
    } catch (err: any) {
      logger.error({ error: err }, 'Failed to upload attachment');
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  })
);

// GET /api/v1/encounters/:encounterId/attachments
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId } = req.params;

    if (!hasRole(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const encounter = await loadEncounterForClinic(req, res, encounterId);
    if (!encounter) {
      return;
    }

    const attachments = (encounter.attachments || []).slice().sort((a: any, b: any) => {
      const aTime = new Date(a.uploadedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.uploadedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    const result = paginate(attachments, req.query as any, { defaultLimit: 20, maxLimit: 100 });

    return res.json({
      status: 'success',
      data: result.data.map(sanitizeAttachment),
      pagination: result.pagination,
    });
  })
);

// GET /api/v1/encounters/:encounterId/attachments/:attachmentId/download
router.get(
  '/:attachmentId/download',
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId, attachmentId } = req.params;

    if (!hasRole(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const encounter = await loadEncounterForClinic(req, res, encounterId);
    if (!encounter) {
      return;
    }

    const attachment = encounter.attachments?.find((a: any) => a.fileId === attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'NotFound', message: 'Attachment not found' });
    }

    try {
      const downloadUrl = await getDownloadUrl(attachment.storageKey, { expiresIn: 15 * 60 });

      await AuditLogModel.create({
        action: 'ATTACHMENT_DOWNLOAD',
        entityType: 'Encounter',
        entityId: encounterId,
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        metadata: { attachmentId, fileId: attachment.fileId },
      });

      return res.json({
        status: 'success',
        data: { downloadUrl, expiresIn: 15 * 60 },
      });
    } catch (err: any) {
      logger.error({ error: err }, 'Failed to get download URL');
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  })
);

// DELETE /api/v1/encounters/:encounterId/attachments/:attachmentId
router.delete(
  '/:attachmentId',
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId, attachmentId } = req.params;

    if (!hasRole(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const encounter = await loadEncounterForClinic(req, res, encounterId);
    if (!encounter) {
      return;
    }

    const attachmentIndex = encounter.attachments?.findIndex((a: any) => a.fileId === attachmentId);
    if (attachmentIndex === undefined || attachmentIndex === -1) {
      return res.status(404).json({ error: 'NotFound', message: 'Attachment not found' });
    }

    try {
      const attachment = encounter.attachments![attachmentIndex];
      await deleteFile(attachment.storageKey);

      encounter.attachments!.splice(attachmentIndex, 1);
      await encounter.save();

      logger.info({ encounterId, attachmentId }, 'Attachment deleted');

      return res.json({ status: 'success', message: 'Attachment deleted' });
    } catch (err: any) {
      logger.error({ error: err }, 'Failed to delete attachment');
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  })
);

export const attachmentRoutes = router;
