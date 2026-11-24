import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ClinicModel } from './clinic.model';
import { ClinicSettingsModel } from './clinic-settings.model';
import { ClinicKeypairModel } from './clinic-keypair.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { generateClinicKeypair } from './keypair.service';
import { sendWelcomeEmail } from '@api/lib/email.service';
import { stellarClient } from '../payments/services/stellar-client';
import { config } from '@health-watchers/config';
import logger from '@api/utils/logger';

const router = Router();

const MAX_STEP = 5;

const step1Schema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  specialty: z.string().optional(),
});

const step2Schema = z.object({
  action: z.enum(['generate', 'import']).optional(),
  publicKey: z.string().optional(),
});

const step3Schema = z.object({
  inviteEmail: z.string().email(),
  inviteName: z.string().optional(),
});

const step4Schema = z.object({
  workingHours: z.record(z.unknown()).optional(),
  appointmentDuration: z.number().positive().optional(),
  timezone: z.string().optional(),
});

const step5Schema = z.object({}).passthrough();

const stepSchemas: Record<number, z.ZodTypeAny> = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
};

const stepBodySchema = z.object({
  data: z.record(z.unknown()).optional(),
});

const rollbackBodySchema = z.object({
  toStep: z.number().int().min(1).max(MAX_STEP),
});

const adminResetBodySchema = z.object({
  clinicId: z.string().min(1),
});

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
router.put(
  '/step/:step',
  validateRequest({ body: stepBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const step = parseInt(req.params.step, 10);
      if (isNaN(step) || step < 1 || step > MAX_STEP) {
        return res.status(400).json({ error: `Invalid step. Must be 1-${MAX_STEP}.` });
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

      const currentStep = clinic.onboardingStep ?? 1;

      // Enforce ordered completion: only the current step may be submitted.
      if (step !== currentStep) {
        return res.status(400).json({
          error: `Cannot complete step ${step}. Expected step ${currentStep}.`,
          expectedStep: currentStep,
        });
      }

      const data = (req.body?.data ?? {}) as Record<string, unknown>;

      // Validate the payload for this specific step.
      const parsed = stepSchemas[step].safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid step data',
          details: parsed.error.flatten(),
        });
      }
      const stepData = parsed.data as Record<string, unknown>;

      switch (step) {
        case 1: {
          // Clinic Information
          const { name, address, phone, email, specialty } = stepData as {
            name: string;
            address: string;
            phone: string;
            email: string;
            specialty?: string;
          };
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
          const { action, publicKey: importedKey } = stepData as {
            action?: string;
            publicKey?: string;
          };

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
          const { inviteEmail, inviteName } = stepData as {
            inviteEmail: string;
            inviteName?: string;
          };
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
          const { workingHours, appointmentDuration, timezone } = stepData as {
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

      const isFinalStep = step === MAX_STEP;
      const update: Record<string, unknown> = {
        onboardingStep: isFinalStep ? MAX_STEP : step + 1,
      };

      if (isFinalStep) {
        update.onboardingCompleted = true;
        update.onboardingCompletedAt = new Date();
      }

      await ClinicModel.findByIdAndUpdate(clinicId, update);

      if (isFinalStep) {
        logger.info({ clinicId }, 'Onboarding completed');
        try {
          await sendWelcomeEmail(clinic.email, clinic.name);
        } catch (emailErr) {
          logger.warn({ err: emailErr, clinicId }, 'Failed to send onboarding welcome email');
        }
      }

      return res.json({
        success: true,
        onboardingStep: update.onboardingStep,
        onboardingCompleted: isFinalStep,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to complete onboarding step');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /onboarding/rollback — return to a previous onboarding step
router.post(
  '/rollback',
  requireRoles('CLINIC_ADMIN'),
  validateRequest({ body: rollbackBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const clinicId = req.user!.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: 'No clinic associated with this account' });
      }

      const { toStep } = req.body as { toStep: number };

      const clinic = await ClinicModel.findById(clinicId);
      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }

      const currentStep = clinic.onboardingStep ?? 1;
      if (toStep >= currentStep) {
        return res.status(400).json({
          error: `Can only roll back to an earlier step. Current step is ${currentStep}.`,
        });
      }

      await ClinicModel.findByIdAndUpdate(clinicId, {
        onboardingStep: toStep,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      });

      logger.info({ clinicId, fromStep: currentStep, toStep }, 'Onboarding rolled back');

      return res.json({
        success: true,
        onboardingStep: toStep,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to roll back onboarding');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /onboarding/admin/reset — admin-only reset of onboarding state
router.post(
  '/admin/reset',
  requireRoles('SUPER_ADMIN'),
  validateRequest({ body: adminResetBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.body as { clinicId: string };

      const clinic = await ClinicModel.findById(clinicId);
      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }

      await ClinicModel.findByIdAndUpdate(clinicId, {
        onboardingStep: 1,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      });

      logger.info({ clinicId, adminId: req.user!.id }, 'Onboarding state reset by admin');

      return res.json({
        success: true,
        clinicId,
        onboardingStep: 1,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to reset onboarding state');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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

    if ((clinic.onboardingStep ?? 1) < MAX_STEP) {
      return res.status(400).json({
        error: `Onboarding not complete. Currently on step ${clinic.onboardingStep}. Complete all ${MAX_STEP} steps first.`,
      });
    }

    await ClinicModel.findByIdAndUpdate(clinicId, {
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
    });

    logger.info({ clinicId }, 'Onboarding completed');
    try {
      await sendWelcomeEmail(clinic.email, clinic.name);
    } catch (emailErr) {
      logger.warn({ err: emailErr, clinicId }, 'Failed to send onboarding welcome email');
    }

    return res.json({ success: true, message: 'Onboarding completed successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to complete onboarding');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
