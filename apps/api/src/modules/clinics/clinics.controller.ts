import { Router, Request, Response } from 'express';
import { ClinicModel } from './clinic.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';

const router = Router();

// POST /clinics — SUPER_ADMIN only
router.post('/', authenticate, requireRoles('SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, address, contactEmail, plan } = req.body;
    const clinic = await ClinicModel.create({ name, address, contactEmail, plan });
    return res.status(201).json({ status: 'success', data: clinic });
  } catch (err: any) {
    return res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// GET /clinics/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const clinic = await ClinicModel.findById(req.params.id);
    if (!clinic) return res.status(404).json({ error: 'NotFound', message: 'Clinic not found' });
    return res.json({ status: 'success', data: clinic });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

export const clinicRoutes = router;
