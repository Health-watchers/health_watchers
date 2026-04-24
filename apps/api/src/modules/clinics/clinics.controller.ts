import { Router, Request, Response } from 'express';
import { ClinicModel } from './clinic.model';
import { ClinicSettingsModel } from './clinic-settings.model';
import { ClinicKeypairModel } from './clinic-keypair.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { generateClinicKeypair } from './keypair.service';
import { stellarClient } from '../payments/services/stellar-client';
import { auditLog } from '../audit/audit.service';
import { config } from '@health-watchers/config';
import logger from '@api/utils/logger';

const router = Router();

// POST /clinics — SUPER_ADMIN only
router.post('/', authenticate, requireRoles('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email, subscriptionTier } = req.body;

    // Generate Stellar keypair for the new clinic
    const { publicKey, encryptedSecretKey, iv } = generateClinicKeypair();

    const clinic = await ClinicModel.create({
      name,
      address,
      phone,
      email,
      stellarPublicKey: publicKey,
      subscriptionTier,
      createdBy: req.user!.userId,
    });

    // Store encrypted secret key in separate collection
    await ClinicKeypairModel.create({
      clinicId: clinic._id,
      publicKey,
      encryptedSecretKey,
      iv,
      keyVersion: 1,
      isActive: true,
    });

    // Auto-create default settings
    await ClinicSettingsModel.create({ clinicId: clinic._id, branding: { clinicName: name } });

    // Fund testnet account via Friendbot (non-blocking)
    if (config.stellarNetwork === 'testnet') {
      stellarClient.fundAccount(publicKey).catch((err) =>
        logger.warn({ err, publicKey }, 'Friendbot funding failed — account will need manual funding'),
      );
    }

    auditLog({
      action: 'KEYPAIR_CREATE',
      resourceType: 'Clinic',
      resourceId: String(clinic._id),
      userId: req.user!.userId,
      metadata: { stellarPublicKey: publicKey },
    }, req);

    return res.status(201).json({ status: 'success', data: clinic });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// GET /clinics — SUPER_ADMIN only
router.get('/', authenticate, requireRoles('SUPER_ADMIN'), async (_req: Request, res: Response) => {
  try {
    const clinics = await ClinicModel.find().sort({ createdAt: -1 });
    return res.json({ status: 'success', data: clinics });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /clinics/:id — SUPER_ADMIN or CLINIC_ADMIN of that clinic
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const clinic = await ClinicModel.findById(req.params.id);
    if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });

    const { role, clinicId } = req.user!;
    if (role !== 'SUPER_ADMIN' && !(role === 'CLINIC_ADMIN' && clinicId === String(clinic._id))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    return res.json({ status: 'success', data: clinic });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// PUT /clinics/:id — SUPER_ADMIN or CLINIC_ADMIN of that clinic
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const clinic = await ClinicModel.findById(req.params.id);
    if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });

    const { role, clinicId } = req.user!;
    if (role !== 'SUPER_ADMIN' && !(role === 'CLINIC_ADMIN' && clinicId === String(clinic._id))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    const allowedFields =
      role === 'SUPER_ADMIN'
        ? req.body
        : (({ name, address, phone, email, stellarPublicKey }: any) => ({
            name, address, phone, email, stellarPublicKey,
          }))(req.body);

    const updated = await ClinicModel.findByIdAndUpdate(req.params.id, allowedFields, {
      new: true,
      runValidators: true,
    });
    return res.json({ status: 'success', data: updated });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// DELETE /clinics/:id — SUPER_ADMIN only (soft delete)
router.delete(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const clinic = await ClinicModel.findById(req.params.id);
      if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });

      await ClinicModel.findByIdAndUpdate(req.params.id, { isActive: false });
      await UserModel.updateMany({ clinicId: req.params.id }, { isActive: false });

      return res.json({ status: 'success', message: 'Clinic deactivated' });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// GET /clinics/:id/users — paginated user list for clinic
router.get('/:id/users', authenticate, async (req: Request, res: Response) => {
  try {
    const clinic = await ClinicModel.findById(req.params.id);
    if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });

    const { role, clinicId } = req.user!;
    if (role !== 'SUPER_ADMIN' && !(role === 'CLINIC_ADMIN' && clinicId === String(clinic._id))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      UserModel.find({ clinicId: req.params.id }, '-password -mfaSecret -resetPasswordTokenHash')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      UserModel.countDocuments({ clinicId: req.params.id }),
    ]);

    return res.json({
      status: 'success',
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /clinics/:id/rotate-keypair — SUPER_ADMIN only
router.post(
  '/:id/rotate-keypair',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const clinic = await ClinicModel.findById(req.params.id);
      if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });

      // Archive current active keypair
      await ClinicKeypairModel.updateMany(
        { clinicId: req.params.id, isActive: true },
        { isActive: false },
      );

      // Get next key version
      const lastKeypair = await ClinicKeypairModel.findOne({ clinicId: req.params.id })
        .sort({ keyVersion: -1 })
        .lean();
      const nextVersion = (lastKeypair?.keyVersion ?? 0) + 1;

      // Generate new keypair
      const { publicKey, encryptedSecretKey, iv } = generateClinicKeypair();

      await ClinicKeypairModel.create({
        clinicId: clinic._id,
        publicKey,
        encryptedSecretKey,
        iv,
        keyVersion: nextVersion,
        isActive: true,
      });

      // Update clinic's public key
      await ClinicModel.findByIdAndUpdate(req.params.id, { stellarPublicKey: publicKey });

      // Transfer remaining balance from old account to new account (non-blocking)
      if (clinic.stellarPublicKey && clinic.stellarPublicKey !== publicKey) {
        stellarClient
          .transferBalance(clinic.stellarPublicKey, publicKey)
          .catch((err) => logger.warn({ err }, 'Balance transfer during keypair rotation failed'));
      }

      // Fund testnet account (non-blocking)
      if (config.stellarNetwork === 'testnet') {
        stellarClient.fundAccount(publicKey).catch((err) =>
          logger.warn({ err, publicKey }, 'Friendbot funding failed for rotated keypair'),
        );
      }

      auditLog({
        action: 'KEYPAIR_ROTATE',
        resourceType: 'Clinic',
        resourceId: String(clinic._id),
        userId: req.user!.userId,
        metadata: { newPublicKey: publicKey, keyVersion: nextVersion },
      }, req);

      return res.json({ status: 'success', data: { publicKey, keyVersion: nextVersion } });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
);

export const clinicRoutes = router;
