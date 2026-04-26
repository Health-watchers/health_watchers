import { Router, Request, Response } from 'express';
import { ClinicModel } from './clinic.model';
import { ClinicSettingsModel } from './clinic-settings.model';
import { ClinicKeypairModel } from './clinic-keypair.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { generateClinicKeypair } from './keypair.service';
import { stellarClient } from '../payments/services/stellar-client';
import { config } from '@health-watchers/config';
import logger from '@api/utils/logger';

const router = Router();

// All onboarding routes require authentication
router.use(authenticate);

// GET /onboarding/status — get current onboarding state
router.get('/status', async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    if (!clinicId) {
      return res.status(400).json({ error: 'No clinic associated with this account' });
    }

    const clinic = await ClinicModel.findById(clinicId).lean();
    if (!clinic) {
      return res.status(404).json({ error: 'Clinic not found' });
    }

    const settings = await ClinicSettingsModel.findOne({ clinicId }).lean();

    return res.json({
      onboardingStep: clinic.onboardingStep ?? 1,
      onboardingCompleted: clinic.onboardingCompleted ?? false,
      onboardingCompletedAt: clinic.onboardingCompletedAt ?? null,
      clinic: {
        name: clinic.name,
        address: clinic.address,
        phone: clinic.phone,
        email: clinic.email,
        stellarPublicKey: clinic.stellarPublicKey,
      },
      settings: settings
        ? {
            workingHours: settings.workingHours,
            appointmentDuration: settings.appointmentDuration,
            timezone: settings.timezone,
          }
        : null,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get onboarding status');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /onboarding/step/:step — complete a step and save its data
router.put('/step/:step', async (req: Request, res: Response) => {
  try {
    const step = parseInt(req.params.step, 10);
    if (isNaN(step) || step < 1 || step > 5) {
      return res.status(400).json({ error: 'Invalid step. Must be 1-5.' });
    }

    const clinicId = req.user!.clinicId;
    if (!clinicId) {
      return res.status(400).json({ error: 'No clinic associated with this account' });
    }

    const clinic = await ClinicModel.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({ error: 'Clinic not found' });
    }

    if (clinic.onboardingCompleted) {
      return res.status(400).json({ error: 'Onboarding already completed' });
    }

    // Cannot skip steps
    if (step > (clinic.onboardingStep ?? 1) + 1) {
      return res
        .status(400)
        .json({
          error: `Cannot skip to step ${step}. Complete step ${clinic.onboardingStep} first.`,
        });
    }

    const { data } = req.body as { data: Record<string, unknown> };

    switch (step) {
      case 1: {
        // Clinic Information
        const { name, address, phone, email, specialty } = data as {
          name?: string;
          address?: string;
          phone?: string;
          email?: string;
          specialty?: string;
        };
        if (!name || !address || !phone || !email) {
          return res.status(400).json({ error: 'name, address, phone, and email are required' });
        }
        await ClinicModel.findByIdAndUpdate(clinicId, { name, address, phone, email });
        await ClinicSettingsModel.findOneAndUpdate(
          { clinicId },
          { 'branding.clinicName': name, ...(specialty ? { specialty } : {}) },
          { upsert: true }
        );
        break;
      }

      case 2: {
        // Stellar Wallet — generate or import
        const { action, publicKey: importedKey } = data as { action?: string; publicKey?: string };

        if (action === 'import') {
          if (!importedKey) {
            return res.status(400).json({ error: 'publicKey is required for import' });
          }
          await ClinicModel.findByIdAndUpdate(clinicId, { stellarPublicKey: importedKey });
        } else {
          // Generate new keypair
          const { publicKey, encryptedSecretKey, iv } = generateClinicKeypair();
          await ClinicModel.findByIdAndUpdate(clinicId, { stellarPublicKey: publicKey });

          const existing = await ClinicKeypairModel.findOne({ clinicId });
          if (!existing) {
            await ClinicKeypairModel.create({
              clinicId,
              publicKey,
              encryptedSecretKey,
              iv,
              keyVersion: 1,
              isActive: true,
            });
          }

          // Fund testnet account (non-blocking)
          if (config.stellarNetwork === 'testnet') {
            stellarClient
              .fundAccount(publicKey)
              .catch((err) =>
                logger.warn({ err, publicKey }, 'Friendbot funding failed during onboarding')
              );
          }
        }
        break;
      }

      case 3: {
        // Staff Setup — invite first CLINIC_ADMIN
        const { inviteEmail, inviteName } = data as { inviteEmail?: string; inviteName?: string };
        if (!inviteEmail) {
          return res.status(400).json({ error: 'inviteEmail is required' });
        }
        // Record the invite intent (actual invite email handled by user management)
        // We just validate and store the intent here
        logger.info(
          { clinicId, inviteEmail, inviteName },
          'Staff invite recorded during onboarding'
        );
        break;
      }

      case 4: {
        // Settings — working hours, appointment duration, timezone
        const { workingHours, appointmentDuration, timezone } = data as {
          workingHours?: Record<string, unknown>;
          appointmentDuration?: number;
          timezone?: string;
        };
        const update: Record<string, unknown> = {};
        if (workingHours) update.workingHours = workingHours;
        if (appointmentDuration) update.appointmentDuration = appointmentDuration;
        if (timezone) update.timezone = timezone;

        if (Object.keys(update).length > 0) {
          await ClinicSettingsModel.findOneAndUpdate({ clinicId }, update, { upsert: true });
        }
        break;
      }

      case 5:
        // Verification step — no data to save, just advance
        break;

      default:
        return res.status(400).json({ error: 'Invalid step' });
    }

    // Advance onboarding step if moving forward
    const nextStep = Math.max(step + 1, clinic.onboardingStep ?? 1);
    await ClinicModel.findByIdAndUpdate(clinicId, {
      onboardingStep: Math.min(nextStep, 5),
    });

    return res.json({ success: true, onboardingStep: Math.min(nextStep, 5) });
  } catch (err) {
    logger.error({ err }, 'Failed to complete onboarding step');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /onboarding/complete — mark onboarding as complete
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const clinicId = req.user!.clinicId;
    if (!clinicId) {
      return res.status(400).json({ error: 'No clinic associated with this account' });
    }

    const clinic = await ClinicModel.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({ error: 'Clinic not found' });
    }

    if (clinic.onboardingCompleted) {
      return res.json({ success: true, message: 'Onboarding already completed' });
    }

    if ((clinic.onboardingStep ?? 1) < 5) {
      return res.status(400).json({
        error: `Onboarding not complete. Currently on step ${clinic.onboardingStep}. Complete all 5 steps first.`,
      });
    }

    await ClinicModel.findByIdAndUpdate(clinicId, {
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
    });

    return res.json({ success: true, message: 'Onboarding completed successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to complete onboarding');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
