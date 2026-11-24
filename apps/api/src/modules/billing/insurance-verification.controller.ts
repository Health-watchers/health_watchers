import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import {
  verifyInsurance,
  getLatestVerification,
  listVerifications,
} from './insurance-verification.service';
import {
  verifyInsuranceSchema,
  listVerificationsQuerySchema,
  latestVerificationQuerySchema,
  idParamSchema,
} from './insurance-verification.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// POST /billing/insurance-verification — run an eligibility check for a patient
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: verifyInsuranceSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, invoiceId } = req.body;

    const verification = await verifyInsurance({
      clinicId: req.user!.clinicId,
      patientId,
      invoiceId,
      requestedBy: req.user!.userId,
    });

    return res.status(201).json({ status: 'success', data: verification });
  })
);

// GET /billing/insurance-verification — list verification history
router.get(
  '/',
  validateRequest({ query: listVerificationsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, limit } = req.query as {
      patientId?: string;
      status?: string;
      limit?: number;
    };

    const data = await listVerifications(req.user!.clinicId, {
      patientId,
      status,
      limit,
    });

    return res.json({ status: 'success', data });
  })
);

// GET /billing/insurance-verification/latest?patientId= — most recent result
router.get(
  '/latest',
  validateRequest({ query: latestVerificationQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.query as { patientId: string };

    const verification = await getLatestVerification(req.user!.clinicId, patientId);
    if (!verification) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'No verification found for patient' });
    }

    return res.json({ status: 'success', data: verification });
  })
);

// GET /billing/insurance-verification/:id — single verification record
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { InsuranceVerificationModel } = await import('./insurance-verification.model');
    const record = await InsuranceVerificationModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    }).lean();

    if (!record) {
      return res.status(404).json({ error: 'NotFound', message: 'Verification not found' });
    }

    return res.json({ status: 'success', data: record });
  })
);

export const insuranceVerificationRoutes = router;
