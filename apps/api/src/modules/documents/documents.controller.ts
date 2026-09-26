import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authenticate } from '@api/middlewares/auth.middleware';
import { DocumentModel } from './models/document.model';
import { DocumentVersionModel } from './models/document-version.model';
import { uploadFile, getDownloadUrl, downloadFile } from './storage.service';
import { config } from '@health-watchers/config';
import {
  encryptBuffer,
  decryptBuffer,
  sha256,
  isEncryptionConfigured,
} from './document-encryption.service';
import type { DocumentEncryption } from './models/document.model';
import { assignRetention } from './document-retention.service';
import { indexDocument } from './document-ocr.service';
import { generatePreview } from './document-preview.service';
import { recordDocumentAudit } from './document-audit.service';
import logger from '@api/utils/logger';

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

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(Object.assign(new Error('InvalidFileType'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

// ── GET /documents?patientId= ────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      patientId,
      clinicId,
      documentType,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    if (!patientId) {
      return res.status(400).json({ error: 'BadRequest', message: 'patientId is required.' });
    }

    const filter: Record<string, unknown> = { patientId };
    if (clinicId) filter.clinicId = clinicId;
    if (documentType) filter.documentType = documentType;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [documents, total] = await Promise.all([
      DocumentModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      DocumentModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: documents,
      meta: { page: pageNum, limit: limitNum, total },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
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
        return res
          .status(413)
          .json({ error: 'FileTooLarge', message: 'File exceeds the 20 MB limit.' });
      }
      // our custom file-type rejection
      if ((err as any).code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          error: 'InvalidFileType',
          message: 'Only PDF, JPEG, PNG, and DICOM files are allowed.',
        });
      }
      return next(err);
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'BadRequest', message: 'No file provided.' });
      }

      const { patientId, clinicId, documentType, documentId } = req.body as {
        patientId: string;
        clinicId: string;
        documentType: string;
        documentId?: string;
      };

      if (!patientId || !clinicId || !documentType) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'patientId, clinicId, and documentType are required.',
        });
      }

      // Build a unique storage key
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storageKey = `documents/${clinicId}/${patientId}/${crypto.randomUUID()}${ext}`;

      // Encrypt at rest with a per-file envelope key when a document encryption
      // key is configured (#1247). Otherwise fall back to storage-layer SSE.
      const contentSha256 = sha256(req.file.buffer);
      let encryption: DocumentEncryption | undefined;
      let bytesToStore = req.file.buffer;
      if (isEncryptionConfigured()) {
        const enc = encryptBuffer(req.file.buffer);
        bytesToStore = enc.ciphertext;
        encryption = enc.encryption;
      }

      await uploadFile({
        storageKey,
        buffer: bytesToStore,
        mimeType: req.file.mimetype,
      });

      let doc;
      let version = 1;

      if (documentId) {
        // Validate documentId to prevent NoSQL injection via request body
        if (!/^[a-f\d]{24}$/i.test(documentId)) {
          return res.status(400).json({ error: 'ValidationError', message: 'Invalid document ID' });
        }
        // Update existing document (new version)
        const existing = await DocumentModel.findById(documentId);
        if (!existing) {
          return res.status(404).json({ error: 'NotFound', message: 'Document not found.' });
        }

        version = (existing.currentVersion || 1) + 1;

        // Mark old version as replaced
        await DocumentVersionModel.updateMany(
          { documentId, isCurrentVersion: true },
          { isCurrentVersion: false, replacedAt: new Date(), replacedBy: undefined }
        );

        // Create version record for old version (carrying its encryption meta)
        await DocumentVersionModel.create({
          documentId,
          patientId: existing.patientId,
          clinicId: existing.clinicId,
          uploadedBy: existing.uploadedBy,
          fileName: existing.fileName,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          storageKey: existing.storageKey,
          documentType: existing.documentType,
          version: existing.currentVersion || 1,
          isCurrentVersion: false,
          encryption: existing.encryption,
          contentSha256: existing.contentSha256,
        });

        // Update document with new version. Reset derived artefacts so the OCR
        // index and preview are regenerated for the new bytes.
        doc = await DocumentModel.findByIdAndUpdate(
          documentId,
          {
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            storageKey,
            currentVersion: version,
            contentSha256,
            encryption,
            ocrStatus: 'pending',
            previewStatus: 'pending',
            $inc: { versionCount: 1 },
            $unset: { ocrText: '', previewStorageKey: '' },
          },
          { new: true }
        );
      } else {
        // Create new document
        doc = await DocumentModel.create({
          patientId,
          clinicId,
          uploadedBy: req.user!.userId,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          storageKey,
          documentType,
          currentVersion: 1,
          versionCount: 1,
          contentSha256,
          encryption,
          ocrStatus: 'pending',
          previewStatus: 'pending',
        });

        // Create version record
        await DocumentVersionModel.create({
          documentId: doc._id,
          patientId,
          clinicId,
          uploadedBy: req.user!.userId,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          storageKey,
          documentType,
          version: 1,
          isCurrentVersion: true,
          encryption,
          contentSha256,
        });
      }

      // ── Lifecycle & indexing (#1247) ────────────────────────────────────
      const docId = String((doc as { _id: unknown })._id);
      try {
        await assignRetention({
          documentId: docId,
          clinicId,
          documentType: documentType as never,
          actorId: req.user!.userId,
        });
      } catch (err) {
        logger.warn({ err, docId }, 'assignRetention failed (non-fatal)');
      }

      await recordDocumentAudit({
        documentId: docId,
        clinicId,
        actorId: req.user!.userId,
        action: documentId ? 'new_version' : 'upload',
        req,
        metadata: {
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          encrypted: Boolean(encryption),
        },
      });

      // Content extraction + preview run in the background.
      void indexDocument(docId).catch((err) =>
        logger.error({ err, docId }, 'OCR indexing failed to start')
      );
      void generatePreview(docId).catch((err) =>
        logger.error({ err, docId }, 'preview generation failed to start')
      );

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
 *       - in: query
 *         name: version
 *         schema: { type: number }
 *         description: Specific version to download (defaults to current)
 *     responses:
 *       200:
 *         description: Pre-signed URL returned
 *       404:
 *         description: Document not found
 */
router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const { version } = req.query;
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Document not found.' });

    let storageKey = doc.storageKey;

    if (version) {
      const versionNum = parseInt(version as string, 10);
      const versionRecord = await DocumentVersionModel.findOne({
        documentId: req.params.id,
        version: versionNum,
      });
      if (!versionRecord) {
        return res
          .status(404)
          .json({ error: 'NotFound', message: `Version ${versionNum} not found.` });
      }
      storageKey = versionRecord.storageKey;
    }

    const url = await getDownloadUrl(storageKey);
    return res.json({ status: 'success', data: { url, expiresInSeconds: 15 * 60 } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── GET /documents/:id/versions ──────────────────────────────────────────────

/**
 * @swagger
 * /documents/{id}/versions:
 *   get:
 *     summary: Get version history for a document
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
 *         description: Version history returned
 *       404:
 *         description: Document not found
 */
router.get('/:id/versions', authenticate, async (req: Request, res: Response) => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Document not found.' });

    const versions = await DocumentVersionModel.find({ documentId: req.params.id })
      .sort({ version: -1 })
      .select('-storageKey')
      .lean();

    return res.json({
      status: 'success',
      data: {
        document: doc,
        versions,
        totalVersions: versions.length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── Local dev file serving ───────────────────────────────────────────────────
// Only active when STORAGE_DRIVER=local; serves the raw file for the "pre-signed" URL

router.get('/_local/:storageKey', authenticate, async (req: Request, res: Response) => {
  const storageKey = decodeURIComponent(req.params.storageKey);

  // If these bytes are envelope-encrypted (#1247), decrypt transparently.
  const [doc, ver] = await Promise.all([
    DocumentModel.findOne({ storageKey }).select('encryption mimeType fileName').lean(),
    DocumentVersionModel.findOne({ storageKey }).select('encryption mimeType fileName').lean(),
  ]);
  const enc = doc?.encryption ?? ver?.encryption;

  if (enc) {
    try {
      const cipher = await downloadFile(storageKey);
      const plain = decryptBuffer(cipher, enc);
      res.setHeader('Content-Type', doc?.mimeType ?? ver?.mimeType ?? 'application/octet-stream');
      return res.send(plain);
    } catch (err) {
      logger.error({ err, storageKey }, 'failed to serve decrypted local document');
      return res.status(500).json({ error: 'InternalError', message: 'Could not read document.' });
    }
  }

  const filePath = `${config.storage.localUploadDir}/${storageKey}`;
  return res.sendFile(filePath, { root: process.cwd() }, (err) => {
    if (err) res.status(404).json({ error: 'NotFound', message: 'File not found on disk.' });
  });
});

export const documentRoutes = router;
