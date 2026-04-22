import { Router, Request, Response } from 'express';
import { ClinicModel } from './clinic.model';
import { UserModel } from '../auth/models/user.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();

// POST /clinics — SUPER_ADMIN only
router.post('/', authenticate, requireRoles('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email, stellarPublicKey, subscriptionTier } = req.body;
    const clinic = await ClinicModel.create({
      name,
      address,
      phone,
      email,
      stellarPublicKey,
      subscriptionTier,
      createdBy: req.user!.userId,
    });
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

    // CLINIC_ADMIN cannot change subscriptionTier or createdBy
    const allowedFields =
      role === 'SUPER_ADMIN'
        ? req.body
        : (({ name, address, phone, email, stellarPublicKey }: any) => ({
            name,
            address,
            phone,
            email,
            stellarPublicKey,
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

      // Soft delete: deactivate clinic and all its users
      await ClinicModel.findByIdAndUpdate(req.params.id, { isActive: false });
      await UserModel.updateMany({ clinicId: req.params.id }, { isActive: false });

      return res.json({ status: 'success', message: 'Clinic deactivated' });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  },
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

export const clinicRoutes = router;
