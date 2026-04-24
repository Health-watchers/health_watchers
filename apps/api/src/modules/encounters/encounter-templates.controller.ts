import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EncounterTemplateModel } from './encounter-template.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

const templateBodySchema = z.object({
  name:                  z.string().min(1).max(200),
  description:           z.string().max(1000).optional(),
  category:              z.string().min(1).max(100),
  defaultChiefComplaint: z.string().max(500).optional(),
  defaultVitalSigns:     z.record(z.unknown()).optional(),
  suggestedDiagnoses:    z.array(z.object({ code: z.string(), description: z.string() })).optional(),
  suggestedTests:        z.array(z.string()).optional(),
  notes:                 z.string().max(2000).optional(),
});

const router = Router();
router.use(authenticate);

// GET /encounter-templates
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const templates = await EncounterTemplateModel.find({
      clinicId: req.user!.clinicId,
      isActive: true,
    }).sort({ usageCount: -1, name: 1 });
    return res.json({ status: 'success', data: templates });
  }),
);

// GET /encounter-templates/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
    });
    if (!template) return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: template });
  }),
);

// POST /encounter-templates
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: templateBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.create({
      ...req.body,
      clinicId: req.user!.clinicId,
      createdBy: req.user!.userId,
    });
    return res.status(201).json({ status: 'success', data: template });
  }),
);

// PUT /encounter-templates/:id
router.put(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: templateBodySchema.partial() }),
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isActive: true },
      req.body,
      { new: true, runValidators: true },
    );
    if (!template) return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: template });
  }),
);

// DELETE /encounter-templates/:id — soft delete
router.delete(
  '/:id',
  WRITE_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isActive: true },
      { isActive: false },
      { new: true },
    );
    if (!template) return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: { id: String(template._id), isActive: false } });
  }),
);

export const encounterTemplateRoutes = router;
