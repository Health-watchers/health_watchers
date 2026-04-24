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
