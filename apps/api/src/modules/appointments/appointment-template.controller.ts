import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  deactivateTemplate,
} from './appointment-template.service';

const appointmentTypes = ['consultation', 'follow-up', 'procedure', 'emergency'] as const;

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  type: z.enum(appointmentTypes),
  defaultDurationMinutes: z.number().int().min(5).max(480),
  isTelemedicine: z.boolean().optional().default(false),
  instructions: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  bufferBefore: z.number().int().min(0).max(60).optional().default(0),
  bufferAfter: z.number().int().min(0).max(60).optional().default(0),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const templateIdParamsSchema = z.object({ id: z.string().min(1) });

const listQuerySchema = z.object({
  type: z.enum(appointmentTypes).optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

const router = Router();
router.use(authenticate);

/**
 * POST /appointment-templates
 * Create a new template (CLINIC_ADMIN / SUPER_ADMIN only).
 */
router.post(
  '/',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: createTemplateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, userId } = req.user!;
    const template = await createTemplate(clinicId, userId, req.body);
    return res.status(201).json({ status: 'success', data: template });
  }),
);

/**
 * GET /appointment-templates
 * List templates for the clinic.
 */
router.get(
  '/',
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const { type, includeInactive } = req.query as {
      type?: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
      includeInactive?: boolean;
    };
    const templates = await listTemplates(clinicId, type, Boolean(includeInactive));
    return res.json({ status: 'success', data: templates });
  }),
);

/**
 * GET /appointment-templates/:id
 * Get a single template by id.
 */
router.get(
  '/:id',
  validateRequest({ params: templateIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const template = await getTemplateById(clinicId, req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    }
    return res.json({ status: 'success', data: template });
  }),
);

/**
 * PUT /appointment-templates/:id
 * Update a template (CLINIC_ADMIN / SUPER_ADMIN only).
 */
router.put(
  '/:id',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ params: templateIdParamsSchema, body: updateTemplateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const updated = await updateTemplate(clinicId, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    }
    return res.json({ status: 'success', data: updated });
  }),
);

/**
 * DELETE /appointment-templates/:id
 * Deactivate (soft-delete) a template (CLINIC_ADMIN / SUPER_ADMIN only).
 */
router.delete(
  '/:id',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ params: templateIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const success = await deactivateTemplate(clinicId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    }
    return res.json({ status: 'success', message: 'Template deactivated' });
  }),
);

export const appointmentTemplateRoutes = router;
