import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { PatientModel } from './models/patient.model';
import { paginate } from '../../utils/paginate';
import { patientSearchQuerySchema } from './patients.validation';
import { toPatientResponse } from './patients.transformer';

const router = Router();
router.use(authenticate);

/**
 * GET /patients/search - Full-text patient search
 */
router.get(
  '/search',
  validateRequest({ query: patientSearchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { q, page = '1', limit = '20', clinicId: queryClinicId } = req.query;
    const page_num = Math.max(1, parseInt(page as string));
    const limit_num = Math.min(100, Math.max(1, parseInt(limit as string)));

    const clinicId =
      req.user!.role === 'SUPER_ADMIN' && queryClinicId ? queryClinicId : req.user!.clinicId;

    const filter: Record<string, any> = { isActive: true, clinicId };

    if (q) {
      filter.$text = { $search: String(q) };
    }

    const result = await paginate(PatientModel, filter, page_num, limit_num, { createdAt: -1 });

    return res.json({
      status: 'success',
      data: result.data.map(toPatientResponse),
      pagination: result.meta,
    });
  })
);

/**
 * GET /patients/by-ssn/:ssn - Lookup patient by SSN
 */
router.get(
  '/by-ssn/:ssn',
  asyncHandler(async (req: Request, res: Response) => {
    const { ssn } = req.params;
    const clinicId = req.user!.clinicId;

    const patient = await PatientModel.findOne({
      ssn,
      clinicId,
      isActive: true,
    }).lean();

    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    return res.json({ status: 'success', data: toPatientResponse(patient) });
  })
);

/**
 * GET /patients/by-mrn/:mrn - Lookup patient by medical record number
 */
router.get(
  '/by-mrn/:mrn',
  asyncHandler(async (req: Request, res: Response) => {
    const { mrn } = req.params;
    const clinicId = req.user!.clinicId;

    const patient = await PatientModel.findOne({
      mrn,
      clinicId,
      isActive: true,
    }).lean();

    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    return res.json({ status: 'success', data: toPatientResponse(patient) });
  })
);

export const patientsSearchRouter = router;
