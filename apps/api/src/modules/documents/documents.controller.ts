import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authenticate } from '@api/middlewares/auth.middleware';
import { DocumentModel } from './models/document.model';
import { uploadFile, getDownloadUrl } from './storage.service';
import { config } from '@health-watchers/config';

const router = Router();

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/dicom',
  'application/octet-stream', // DICOM files sometimes arrive as octet-stream
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.dcm']);

// ── Multer setup (memory storage — we forward to S3 or disk ourselves) ───────

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(Object.assign(new Error('InvalidFileType'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

// ── POST /documents/upload ───────────────────────────────────────────────────

/**
 * @swagger
 * /documents/upload:
 *   post:
 *     summary: Upload a patient document (PDF, JPEG, PNG, DICOM — max 20 MB)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, patientId, clinicId, documentType]
 *             properties:
 *               file:         { type: string, format: binary }
 *               patientId:    { type: string }
 *               clinicId:     { type: string }
 *               documentType:
 *                 type: string
 *                 enum: [lab_result, referral_letter, consent_form, medical_image, other]
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Invalid file type
 *       413:
 *         description: File too large
 */
router.post(
  '/upload',
  authenticate,
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();

      // multer size limit
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FileTooLarge', message: 'File exceeds the 20 MB limit.' });
      }
      // our custom file-type rejection
      if ((err as any).code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'InvalidFileType', message: 'Only PDF, JPEG, PNG, and DICOM files are allowed.' });
      }
      return next(err);
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'BadRequest', message: 'No file provided.' });
      }

      const { patientId, clinicId, documentType } = req.body as {
        patientId: string; clinicId: string; documentType: string;
      };

      if (!patientId || !clinicId || !documentType) {
        return res.status(400).json({ error: 'BadRequest', message: 'patientId, clinicId, and documentType are required.' });
      }

      // Build a unique storage key
      const ext        = path.extname(req.file.originalname).toLowerCase();
      const storageKey = `documents/${clinicId}/${patientId}/${crypto.randomUUID()}${ext}`;

      await uploadFile({
        storageKey,
        buffer:   req.file.buffer,
        mimeType: req.file.mimetype,
      });

      const doc = await DocumentModel.create({
        patientId,
        clinicId,
        uploadedBy:   req.user!.userId,
        fileName:     req.file.originalname,
        mimeType:     req.file.mimetype,
        sizeBytes:    req.file.size,
        storageKey,
        documentType,
      });

      return res.status(201).json({ status: 'success', data: doc });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── GET /documents/:id/download ──────────────────────────────────────────────

/**
 * @swagger
 * /documents/{id}/download:
 *   get:
 *     summary: Get a pre-signed download URL for a document (valid 15 minutes)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pre-signed URL returned
 *       404:
 *         description: Document not found
 */
router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Document not found.' });

    const url = await getDownloadUrl(doc.storageKey);
    return res.json({ status: 'success', data: { url, expiresInSeconds: 15 * 60 } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── Local dev file serving ───────────────────────────────────────────────────
// Only active when STORAGE_DRIVER=local; serves the raw file for the "pre-signed" URL

router.get('/_local/:storageKey', authenticate, (req: Request, res: Response) => {
  const storageKey = decodeURIComponent(req.params.storageKey);
  const filePath   = `${config.storage.localUploadDir}/${storageKey}`;
  return res.sendFile(filePath, { root: process.cwd() }, (err) => {
    if (err) res.status(404).json({ error: 'NotFound', message: 'File not found on disk.' });
  });
});

export const documentRoutes = router;
