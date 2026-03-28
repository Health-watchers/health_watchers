import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { UserModel } from '../auth/models/user.model';
import { ClinicModel } from '../clinics/clinic.model';

const router = Router();
router.use(authenticate);

// GET /users/me
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId).lean();
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found or deactivated' });
    }

    const clinic = await ClinicModel.findById(user.clinicId).lean();

    res.set('Cache-Control', 'private, max-age=60');
    return res.json({
      status: 'success',
      data: {
        userId:     String(user._id),
        fullName:   user.fullName,
        email:      user.email,
        role:       user.role,
        clinicId:   String(user.clinicId),
        clinicName: clinic?.name ?? null,
      },
    });
  }),
);

export const userRoutes = router;
