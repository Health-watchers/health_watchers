import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { EncounterModel } from './encounter.model';
import { uploadFile, deleteFile, getDownloadUrl } from '../documents/storage.service';
import { randomUUID } from 'crypto';
import logger from '@api/utils/logger';
import multer from 'multer';

const router = Router({ mergeParams: true });
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ALLOWED_TYPES = ['PDF', 'JPEG', 'PNG', 'DICOM'];
const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/dicom': 'DICOM',
};

function getMimeType(mimeType: string): string | null {
  return MIME_TYPE_MAP[mimeType] || null;
}

// POST /api/v1/encounters/:encounterId/attachments
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'BadRequest', message: 'No file provided' });
    }

    const fileType = getMimeType(file.mimetype);
    if (!fileType || !ALLOWED_TYPES.includes(fileType)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      });
    }

    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'BadRequest', message: 'File size exceeds 10MB limit' });
    }

    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (encounter.clinicId.toString() !== req.user!.clinicId.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    try {
      const fileId = randomUUID();
      const storageKey = `encounters/${encounterId}/attachments/${fileId}`;

      await uploadFile({
        storageKey,
        buffer: file.buffer,
        mimeType: file.mimetype,
        encrypt: true,
      });

      const attachment = {
        fileId,
        fileName: file.originalname,
        fileType: fileType as 'PDF' | 'JPEG' | 'PNG' | 'DICOM',
        fileSize: file.size,
        uploadedBy: req.user!.userId,
        uploadedAt: new Date(),
        storageKey,
      };

      encounter.attachments = encounter.attachments || [];
      encounter.attachments.push(attachment as any);
      await encounter.save();

      logger.info({ encounterId, fileId }, 'Attachment uploaded');

      return res.json({ status: 'success', data: attachment });
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

    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (encounter.clinicId.toString() !== req.user!.clinicId.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const attachments = encounter.attachments || [];
    return res.json({ status: 'success', data: attachments });
  })
);

// GET /api/v1/encounters/:encounterId/attachments/:attachmentId/download
router.get(
  '/:attachmentId/download',
  asyncHandler(async (req: Request, res: Response) => {
    const { encounterId, attachmentId } = req.params;

    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (encounter.clinicId.toString() !== req.user!.clinicId.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    const attachment = encounter.attachments?.find((a: any) => a.fileId === attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'NotFound', message: 'Attachment not found' });
    }

    try {
      const downloadUrl = await getDownloadUrl(attachment.storageKey);
      return res.json({ status: 'success', data: { downloadUrl } });
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

    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    if (encounter.clinicId.toString() !== req.user!.clinicId.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
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
