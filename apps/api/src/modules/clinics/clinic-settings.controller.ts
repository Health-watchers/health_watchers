import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ClinicSettingsModel } from './clinic-settings.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '../audit/audit.service';

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
