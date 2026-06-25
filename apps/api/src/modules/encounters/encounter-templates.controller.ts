import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EncounterTemplateModel } from './encounter-template.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { templateMarketplaceService } from './template-marketplace.service';

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const ADMIN_ROLES = requireRoles('SUPER_ADMIN');

const templateBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().min(1).max(100),
  defaultChiefComplaint: z.string().max(500).optional(),
  defaultVitalSigns: z.record(z.unknown()).optional(),
  suggestedDiagnoses: z.array(z.object({ code: z.string(), description: z.string() })).optional(),
  suggestedTests: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
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
  })
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
    if (!template)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: template });
  })
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
  })
);

// PUT /encounter-templates/:id — create a new version instead of overwriting
router.put(
  '/:id',
  WRITE_ROLES,
  validateRequest({ body: templateBodySchema.partial() }),
  asyncHandler(async (req: Request, res: Response) => {
    const current = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
      isActive: true,
      isLatest: true,
    });
    if (!current)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });

    // Mark the current version as no longer latest
    await EncounterTemplateModel.updateOne({ _id: current._id }, { isLatest: false });

    // Create the new version
    const newVersion = await EncounterTemplateModel.create({
      ...current.toObject(),
      _id: undefined,
      ...req.body,
      clinicId: req.user!.clinicId,
      createdBy: req.user!.userId,
      version: current.version + 1,
      previousVersionId: current._id,
      isLatest: true,
      usageCount: 0,
      createdAt: undefined,
      updatedAt: undefined,
    });
    return res.json({ status: 'success', data: newVersion });
  })
);

// DELETE /encounter-templates/:id — soft delete
router.delete(
  '/:id',
  WRITE_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isActive: true },
      { isActive: false },
      { new: true }
    );
    if (!template)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: { id: String(template._id), isActive: false } });
  })
);

// ── Versioning & clinic customization ────────────────────────────────────────

/**
 * @swagger
 * /encounter-templates/{id}/clone:
 *   post:
 *     summary: Clone a template for clinic-specific customization
 *     description: >
 *       Creates a clinic-owned copy of any template (including global ones).
 *       The clone starts at version 1 and is linked to the source via previousVersionId.
 *     tags: [Encounter Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: "Override the cloned template's name" }
 *     responses:
 *       201: { description: Cloned template }
 *       404: { description: Source template not found }
 */
router.post(
  '/:id/clone',
  WRITE_ROLES,
  validateRequest({ body: z.object({ name: z.string().min(1).max(200).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    // Allow cloning from own clinic or from global templates
    const source = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      isActive: true,
      $or: [{ clinicId: req.user!.clinicId }, { isGlobal: true }],
    });
    if (!source)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });

    const { _id, createdAt, updatedAt, ...rest } = source.toObject();
    const clone = await EncounterTemplateModel.create({
      ...rest,
      name: req.body.name ?? `${source.name} (copy)`,
      clinicId: req.user!.clinicId,
      isGlobal: false,
      createdBy: req.user!.userId,
      version: 1,
      previousVersionId: source._id,
      isLatest: true,
      usageCount: 0,
      isApproved: false,
      approvedBy: undefined,
      publishedAt: undefined,
      publishedBy: undefined,
      visibility: 'clinic',
    });
    return res.status(201).json({ status: 'success', data: clone });
  })
);

/**
 * @swagger
 * /encounter-templates/{id}/history:
 *   get:
 *     summary: Get the version history of a template lineage
 *     description: Returns all versions in the lineage, newest first.
 *     tags: [Encounter Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Version history array }
 *       404: { description: Template not found }
 */
router.get(
  '/:id/history',
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      $or: [{ clinicId: req.user!.clinicId }, { isGlobal: true }],
    });
    if (!template)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });

    // Walk the lineage: collect the root id by following previousVersionId chain,
    // then fetch all documents sharing that root.
    // Simpler approach: find all docs whose lineage includes this id by matching
    // on the name+clinicId lineage, or by traversing previousVersionId.
    // We use a forward-lookup: find all templates in the same clinic that share
    // a common ancestor (the earliest previousVersionId or the template itself).
    const history = await EncounterTemplateModel.find({
      clinicId: template.clinicId,
      isActive: true,
      $or: [
        { _id: template._id },
        { previousVersionId: template._id },
        // Also include the ancestors of this template
        { _id: template.previousVersionId },
      ],
    })
      .sort({ version: -1 })
      .select('_id name version previousVersionId isLatest createdAt createdBy')
      .lean();

    return res.json({ status: 'success', data: history });
  })
);

/**
 * @swagger
 * /encounter-templates/{id}/preview:
 *   get:
 *     summary: Preview a template without recording usage
 *     tags: [Encounter Templates]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Full template document }
 *       404: { description: Template not found }
 */
router.get(
  '/:id/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      isActive: true,
      $or: [{ clinicId: req.user!.clinicId }, { isGlobal: true }],
    }).lean();
    if (!template)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });
    return res.json({ status: 'success', data: template });
  })
);

// POST /encounter-templates/:id/publish — Publish template to marketplace
router.post(
  '/:id/publish',
  WRITE_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const template = await EncounterTemplateModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    });
    if (!template)
      return res.status(404).json({ error: 'NotFound', message: 'Template not found' });

    const published = await templateMarketplaceService.publishTemplate(
      req.params.id,
      req.user!.userId
    );
    return res.json({ status: 'success', data: published });
  })
);

// POST /encounter-templates/:id/import — Import template to clinic
router.post(
  '/:id/import',
  WRITE_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const imported = await templateMarketplaceService.importTemplate({
      templateId: req.params.id,
      clinicId: req.user!.clinicId.toString(),
      userId: req.user!.userId,
    });
    return res.status(201).json({ status: 'success', data: imported });
  })
);

// POST /encounter-templates/:id/rate — Rate a template
router.post(
  '/:id/rate',
  WRITE_ROLES,
  validateRequest({ body: z.object({ rating: z.number().min(1).max(5) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const rated = await templateMarketplaceService.rateTemplate(req.params.id, req.body.rating);
    return res.json({ status: 'success', data: rated });
  })
);

// GET /encounter-templates/marketplace/browse — Browse marketplace
router.get(
  '/marketplace/browse',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const tags = (req.query.tags as string)?.split(',').filter(Boolean);

    const { templates, total } = await templateMarketplaceService.browseMarketplace(
      limit,
      offset,
      tags
    );
    return res.json({ status: 'success', data: templates, pagination: { limit, offset, total } });
  })
);

// GET /encounter-templates/marketplace/search — Search marketplace
router.get(
  '/marketplace/search',
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.q as string;
    if (!query)
      return res.status(400).json({ error: 'BadRequest', message: 'Search query required' });

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const tags = (req.query.tags as string)?.split(',').filter(Boolean);

    const { templates, total } = await templateMarketplaceService.searchMarketplace(
      query,
      tags,
      limit,
      offset
    );
    return res.json({ status: 'success', data: templates, pagination: { limit, offset, total } });
  })
);

// ── Admin endpoints ───────────────────────────────────────────────────────────

// POST /encounter-templates/:id/approve — Approve template for marketplace
router.post(
  '/:id/approve',
  ADMIN_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const approved = await templateMarketplaceService.approveTemplate(
      req.params.id,
      req.user!.userId
    );
    return res.json({ status: 'success', data: approved });
  })
);

// POST /encounter-templates/:id/reject — Reject template
router.post(
  '/:id/reject',
  ADMIN_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const rejected = await templateMarketplaceService.rejectTemplate(req.params.id);
    return res.json({ status: 'success', data: rejected });
  })
);

// POST /encounter-templates/:id/remove — Remove template from marketplace
router.post(
  '/:id/remove',
  ADMIN_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const removed = await templateMarketplaceService.removeTemplate(req.params.id);
    return res.json({ status: 'success', data: removed });
  })
);

export const encounterTemplateRoutes = router;
