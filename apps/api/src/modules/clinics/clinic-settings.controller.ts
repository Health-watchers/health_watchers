import path from 'path';
import crypto from 'crypto';
import multer, { FileFilterCallback } from 'multer';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ClinicSettingsModel } from './clinic-settings.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '../audit/audit.service';
import { getDownloadUrl, uploadFile } from '../documents/storage.service';

// Valid IANA timezones (representative subset — full list via Intl.supportedValuesOf in Node 18+)
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const clinicSettingsRoutes = Router();
clinicSettingsRoutes.use(authenticate);
clinicSettingsRoutes.use(requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const LOGO_TYPES = new Set(['image/png', 'image/jpeg']);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!LOGO_EXTENSIONS.has(ext) || !LOGO_TYPES.has(file.mimetype)) {
    return cb(Object.assign(new Error('InvalidFileType'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGO_MAX_BYTES }, fileFilter });

// POST /api/v1/settings/logo — upload a clinic logo image
clinicSettingsRoutes.post('/logo', (req: Request, res: Response, next) => {
  upload.single('logo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'FileTooLarge', message: 'Logo must be smaller than 2 MB.' });
    }
    if ((err as any).code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ error: 'InvalidFileType', message: 'Logo must be a PNG or JPEG image.' });
    }
    return next(err);
  });
}, async (req: Request, res: Response) => {
  try {
    const { clinicId, userId } = req.user!;
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'No logo provided.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const storageKey = `clinic-logo/${clinicId}/${crypto.randomUUID()}${ext}`;
    await uploadFile({ storageKey, buffer: req.file.buffer, mimeType: req.file.mimetype });
    const logoUrl = await getDownloadUrl(storageKey);

    const settings = await ClinicSettingsModel.findOneAndUpdate(
      { clinicId },
      {
        $set: {
          'branding.logoUrl': logoUrl,
          'branding.logoStorageKey': storageKey,
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    await auditLog({
      userId,
      clinicId,
      action: 'UPDATE_SETTINGS' as any,
      resourceType: 'ClinicSettings',
      resourceId: String(settings!._id),
      metadata: { logoUrl },
    });

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /api/v1/settings/signature — upload a clinic signature image
clinicSettingsRoutes.post('/signature', (req: Request, res: Response, next) => {
  upload.single('signature')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'FileTooLarge', message: 'Signature must be smaller than 2 MB.' });
    }
    if ((err as any).code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ error: 'InvalidFileType', message: 'Signature must be a PNG or JPEG image.' });
    }
    return next(err);
  });
}, async (req: Request, res: Response) => {
  try {
    const { clinicId, userId } = req.user!;
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'No signature provided.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const storageKey = `clinic-signature/${clinicId}/${crypto.randomUUID()}${ext}`;
    await uploadFile({ storageKey, buffer: req.file.buffer, mimeType: req.file.mimetype });
    const signatureUrl = await getDownloadUrl(storageKey);

    const settings = await ClinicSettingsModel.findOneAndUpdate(
      { clinicId },
      {
        $set: {
          'branding.signatureUrl': signatureUrl,
          'branding.signatureStorageKey': storageKey,
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    await auditLog({
      userId,
      clinicId,
      action: 'UPDATE_SETTINGS' as any,
      resourceType: 'ClinicSettings',
      resourceId: String(settings!._id),
      metadata: { signatureUrl },
    });

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /api/v1/settings — get clinic settings
clinicSettingsRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    let settings = await ClinicSettingsModel.findOne({ clinicId }).lean();

    // Auto-create default settings if none exist
    if (!settings) {
      settings = await ClinicSettingsModel.create({ clinicId });
    }

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// PUT /api/v1/settings — update clinic settings
clinicSettingsRoutes.put('/', async (req: Request, res: Response) => {
  try {
    const { clinicId, userId } = req.user!;
    const { workingHours, appointmentDuration, timezone, currency, notifications, branding } =
      req.body;

    if (timezone && !isValidTimezone(timezone)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Invalid timezone: '${timezone}'. Use a valid IANA timezone (e.g. 'Africa/Lagos', 'UTC', 'America/New_York').`,
      });
    }

    const update: Record<string, unknown> = {};
    if (workingHours !== undefined) update.workingHours = workingHours;
    if (appointmentDuration !== undefined) update.appointmentDuration = appointmentDuration;
    if (timezone !== undefined) update.timezone = timezone;
    if (currency !== undefined) update.currency = currency;
    if (notifications !== undefined) update.notifications = notifications;
    if (branding !== undefined) update.branding = branding;

    const settings = await ClinicSettingsModel.findOneAndUpdate(
      { clinicId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    // Audit log
    await auditLog({
      userId,
      clinicId,
      action: 'UPDATE_SETTINGS' as any,
      resourceType: 'ClinicSettings',
      resourceId: String(settings!._id),
      metadata: { updatedFields: Object.keys(update) },
    });

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// PUT /api/v1/settings/stellar — update Stellar wallet (requires password confirmation)
clinicSettingsRoutes.put('/stellar', async (req: Request, res: Response) => {
  try {
    const { clinicId, userId } = req.user!;
    const { stellarPublicKey, password } = req.body;

    if (!stellarPublicKey || !password) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'stellarPublicKey and password are required',
      });
    }

    // Verify password
    const user = await UserModel.findById(userId).select('+password');
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(403).json({ error: 'Forbidden', message: 'Incorrect password' });
    }

    const settings = await ClinicSettingsModel.findOneAndUpdate(
      { clinicId },
      { $set: { stellarPublicKey } },
      { new: true, upsert: true }
    ).lean();

    await auditLog({
      userId,
      clinicId,
      action: 'UPDATE_SETTINGS' as any,
      resourceType: 'ClinicSettings',
      resourceId: String(settings!._id),
      metadata: { stellarPublicKey },
    });

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});
