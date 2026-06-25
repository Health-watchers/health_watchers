import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { CarePlanModel } from './care-plan.model';
import {
  createCarePlanSchema,
  updateCarePlanSchema,
  reviewCarePlanSchema,
  idParamSchema,
} from './care-plan.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// GET /api/v1/care-plans?patientId=
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, page = '1', limit = '20' } = req.query as Record<string, string>;

    if (!patientId) {
      return res.status(400).json({ error: 'BadRequest', message: 'patientId is required.' });
    }

    const filter: Record<string, unknown> = { patientId, clinicId: req.user!.clinicId };
    if (status) filter.status = status;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [plans, total] = await Promise.all([
      CarePlanModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      CarePlanModel.countDocuments(filter),
    ]);

    return res.json({ status: 'success', data: plans, meta: { page: pageNum, limit: limitNum, total } });
  })
);

// POST /api/v1/care-plans
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: createCarePlanSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const doc = await CarePlanModel.create({
      ...req.body,
      clinicId,
      createdBy: req.user!.userId,
      reviewDate: new Date(req.body.reviewDate),
    });
    return res.status(201).json({ status: 'success', data: doc });
  })
);

// GET /api/v1/care-plans/:id
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await CarePlanModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Care plan not found' });
    return res.json({ status: 'success', data: doc });
  })
);

// PUT /api/v1/care-plans/:id
router.put(
  '/:id',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema, body: updateCarePlanSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const update = { ...req.body };
    if (update.reviewDate) update.reviewDate = new Date(update.reviewDate);

    const doc = await CarePlanModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      update,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Care plan not found' });
    return res.json({ status: 'success', data: doc });
  })
);

// POST /api/v1/care-plans/:id/review
router.post(
  '/:id/review',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema, body: reviewCarePlanSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const review = {
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      notes: req.body.notes,
      nextReviewDate: req.body.nextReviewDate ? new Date(req.body.nextReviewDate) : undefined,
    };

    const update: Record<string, unknown> = { $push: { reviewHistory: review } };
    if (review.nextReviewDate) update.reviewDate = review.nextReviewDate;

    const doc = await CarePlanModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Care plan not found' });
    return res.json({ status: 'success', data: doc });
  })
);

export { router as carePlanRoutes };
