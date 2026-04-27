import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { imageUpload } from '@api/middlewares/upload.middleware';
import { PatientModel } from './models/patient.model';
import { uploadFile, getDownloadUrl, deleteFile } from '../documents/storage.service';
import { auditLog } from '../audit/audit.service';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// ── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(clinicId: string, patientId: string, suffix: string, ext: string) {
  return `photos/${clinicId}/${patientId}/${suffix}-${crypto.randomUUID()}${ext}`;
}

function handleMulterError(err: unknown, res: Response): boolean {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'FileTooLarge', message: 'Photo must be 5 MB or less.' });
    return true;
  }
  if ((err as any)?.code === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'InvalidFileType', message: 'Only JPEG, PNG, and WebP images are allowed.' });
    return true;
  }
  return false;
}

// ── POST /patients/:id/photo ─────────────────────────────────────────────────

router.post(
  '/:id/photo',
  WRITE_ROLES,
  (req: Request, res: Response, next) => {
    imageUpload.single('photo')(req, res, (err) => {
      if (err && handleMulterError(err, res)) return;
      if (err) return next(err);
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'BadRequest', message: 'No photo file provided.' });
      }

      const patient = await PatientModel.findById(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found.' });
      }

      const clinicId = String(patient.clinicId);
      const patientId = String(patient._id);

      // Delete old photos from storage if they exist
      if (patient.photoUrl) {
        const oldKey = extractStorageKey(patient.photoUrl);
        if (oldKey) await deleteFile(oldKey).catch(() => {});
      }
      if (patient.thumbnailUrl) {
        const oldKey = extractStorageKey(patient.thumbnailUrl);
        if (oldKey) await deleteFile(oldKey).catch(() => {});
      }

      // Resize to 400×400 (square crop) and 100×100 thumbnail
      const [photoBuffer, thumbBuffer] = await Promise.all([
        sharp(req.file.buffer).resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer(),
        sharp(req.file.buffer).resize(100, 100, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer(),
      ]);

      const photoKey = storageKey(clinicId, patientId, 'photo', '.jpg');
      const thumbKey = storageKey(clinicId, patientId, 'thumb', '.jpg');

      await Promise.all([
        uploadFile({ storageKey: photoKey, buffer: photoBuffer, mimeType: 'image/jpeg', encrypt: true }),
        uploadFile({ storageKey: thumbKey, buffer: thumbBuffer, mimeType: 'image/jpeg', encrypt: true }),
      ]);

      await PatientModel.findByIdAndUpdate(patientId, {
        photoUrl: photoKey,
        thumbnailUrl: thumbKey,
      });

      await auditLog(
        {
          action: 'PATIENT_PHOTO_UPLOAD',
          resourceType: 'Patient',
          resourceId: patientId,
          userId: req.user!.userId,
          clinicId,
          outcome: 'SUCCESS',
        },
        req
      );

      return res.status(201).json({ status: 'success', message: 'Photo uploaded.' });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── GET /patients/:id/photo ──────────────────────────────────────────────────

router.get('/:id/photo', async (req: Request, res: Response) => {
  try {
    const patient = await PatientModel.findById(req.params.id).select('photoUrl clinicId');
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found.' });
    }
    if (!patient.photoUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient has no photo.' });
    }

    const url = await getDownloadUrl(patient.photoUrl);

    await auditLog(
      {
        action: 'PATIENT_PHOTO_ACCESS',
        resourceType: 'Patient',
        resourceId: String(patient._id),
        userId: req.user!.userId,
        clinicId: String(patient.clinicId),
        outcome: 'SUCCESS',
      },
      req
    );

    return res.json({ status: 'success', data: { url, expiresInSeconds: 3600 } });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── DELETE /patients/:id/photo ───────────────────────────────────────────────

router.delete('/:id/photo', WRITE_ROLES, async (req: Request, res: Response) => {
  try {
    const patient = await PatientModel.findById(req.params.id).select(
      'photoUrl thumbnailUrl clinicId'
    );
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found.' });
    }
    if (!patient.photoUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient has no photo.' });
    }

    await Promise.all([
      deleteFile(patient.photoUrl).catch(() => {}),
      patient.thumbnailUrl ? deleteFile(patient.thumbnailUrl).catch(() => {}) : Promise.resolve(),
    ]);

    await PatientModel.findByIdAndUpdate(req.params.id, {
      $unset: { photoUrl: '', thumbnailUrl: '' },
    });

    await auditLog(
      {
        action: 'PATIENT_PHOTO_DELETE',
        resourceType: 'Patient',
        resourceId: String(patient._id),
        userId: req.user!.userId,
        clinicId: String(patient.clinicId),
        outcome: 'SUCCESS',
      },
      req
    );

    return res.json({ status: 'success', message: 'Photo deleted.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// ── Utility ──────────────────────────────────────────────────────────────────

/** Extract the raw storage key from a stored value (key is stored directly, not as a URL) */
function extractStorageKey(value: string): string | null {
  // Keys are stored as plain paths like "photos/clinicId/patientId/photo-uuid.jpg"
  if (value.startsWith('photos/')) return value;
  return null;
}

export const patientPhotoRoutes = router;
