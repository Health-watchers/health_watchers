import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { BAAModel } from './baa.model';
import { BreachNotificationModel } from './breach.model';
import { uploadFile, getDownloadUrl } from '../documents/storage.service';
import logger from '../../utils/logger';

const router = Router();

const BAA_ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const BAA_ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const baaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!BAA_ALLOWED_EXTENSIONS.has(ext) || !BAA_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(Object.assign(new Error('InvalidFileType'), { code: 'INVALID_FILE_TYPE' }));
    }
    cb(null, true);
  },
});

// GET /api/v1/compliance/baas - List all BAAs for clinic
router.get(
  '/baas',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const baas = await BAAModel.find({ clinicId: req.user!.clinicId }).sort({ createdAt: -1 });
      return res.json(baas);
    } catch (err) {
      logger.error(`Error fetching BAAs: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/compliance/baas - Create/update BAA
router.post(
  '/baas',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { businessAssociate, status, signedDate, expiryDate, documentUrl, notes } = req.body;

      if (!businessAssociate || typeof businessAssociate !== 'string') {
        return res
          .status(400)
          .json({ error: 'ValidationError', message: 'businessAssociate is required' });
      }

      const safeBusinessAssociate = String(businessAssociate).slice(0, 500);
      const baa = await BAAModel.findOneAndUpdate(
        { clinicId: req.user!.clinicId, businessAssociate: safeBusinessAssociate },
        {
          status,
          signedDate,
          expiryDate,
          documentUrl,
          notes,
        },
        { upsert: true, new: true }
      );

      return res.json(baa);
    } catch (err) {
      logger.error(`Error creating/updating BAA: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/compliance/baas/:id/document - Upload the signed BAA document
router.post(
  '/baas/:id/document',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  (req: Request, res: Response, next) => {
    baaUpload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ error: 'FileTooLarge', message: 'File exceeds the 20 MB limit.' });
      }
      if ((err as any).code === 'INVALID_FILE_TYPE') {
        return res
          .status(400)
          .json({
            error: 'InvalidFileType',
            message: 'Only PDF, JPEG, and PNG files are allowed.',
          });
      }
      return next(err);
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!OBJECT_ID_RE.test(req.params.id)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid BAA ID' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'BadRequest', message: 'No file provided.' });
      }

      const baa = await BAAModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
      if (!baa) return res.status(404).json({ error: 'NotFound', message: 'BAA not found' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      const storageKey = `compliance/${req.user!.clinicId}/baas/${baa._id}/${crypto.randomUUID()}${ext}`;
      await uploadFile({ storageKey, buffer: req.file.buffer, mimeType: req.file.mimetype });

      baa.documentStorageKey = storageKey;
      baa.documentFileName = req.file.originalname;
      baa.documentUrl = `/api/v1/compliance/baas/${baa._id}/document`;
      await baa.save();

      return res.status(201).json(baa);
    } catch (err) {
      logger.error(`Error uploading BAA document: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/compliance/baas/:id/document - Download the signed BAA document
router.get(
  '/baas/:id/document',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      if (!OBJECT_ID_RE.test(req.params.id)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid BAA ID' });
      }
      const baa = await BAAModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
      if (!baa?.documentStorageKey) {
        return res.status(404).json({ error: 'NotFound', message: 'BAA document not found' });
      }
      return res.redirect(await getDownloadUrl(baa.documentStorageKey));
    } catch (err) {
      logger.error(`Error fetching BAA document: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/compliance/breaches - List breach notifications
router.get(
  '/breaches',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const breaches = await BreachNotificationModel.find({ clinicId: req.user!.clinicId }).sort({
        detectedAt: -1,
      });
      return res.json(breaches);
    } catch (err) {
      logger.error(`Error fetching breaches: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/compliance/breaches - Report a breach
router.post(
  '/breaches',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { breachType, description, affectedRecords } = req.body;

      if (!breachType || !description || !affectedRecords) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'breachType, description, and affectedRecords are required',
        });
      }

      const detectedAt = new Date();
      const notificationDeadline = new Date(detectedAt.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const breach = await BreachNotificationModel.create({
        clinicId: req.user!.clinicId,
        breachType,
        description,
        affectedRecords,
        detectedAt,
        notificationDeadline,
        status: 'detected',
      });

      logger.warn(`[HIPAA] Breach detected for clinic ${req.user!.clinicId}: ${breachType}`);
      return res.status(201).json(breach);
    } catch (err) {
      logger.error(`Error reporting breach: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

export const complianceRoutes = router;
