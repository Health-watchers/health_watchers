import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import interactionService from './interaction.service';
import { checkResultCache } from './interaction-cache';
import {
  checkInteractionsBodySchema,
  resolveDrugParamsSchema,
  lookupDrugQuerySchema,
  analyticsQuerySchema,
} from './interaction.validation';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /interactions/check:
 *   post:
 *     summary: Check medications for drug–drug, drug–allergy, and drug–food interactions
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               medications: { type: array, items: { type: string }, example: [warfarin, aspirin] }
 *               allergies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     allergen: { type: string }
 *                     severity: { type: string, enum: [mild, moderate, severe, life-threatening] }
 *               includeFood: { type: boolean, default: true }
 *               patientId: { type: string }
 *     responses:
 *       200:
 *         description: Interaction check results with severity classification and explanations
 */
router.post(
  '/check',
  validateRequest({ body: checkInteractionsBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { medications, allergies, includeFood, patientId } = req.body;
    const result = await interactionService.check({
      medications,
      allergies,
      includeFood,
      patientId,
      clinicId: String(req.user!.clinicId),
      userId: String(req.user!.id),
    });
    return res.json({ status: 'success', data: result });
  })
);

/**
 * @swagger
 * /interactions/resolve/:name:
 *   get:
 *     summary: Resolve a free-text medication name against the RxNorm-derived catalog
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resolved drug metadata or 404 if unresolvable
 */
router.get(
  '/resolve/:name',
  validateRequest({ params: resolveDrugParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const drug = await interactionService.resolve(req.params.name);
    if (!drug) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Medication '${req.params.name}' could not be resolved against the drug catalog`,
      });
    }
    return res.json({ status: 'success', data: drug });
  })
);

/**
 * @swagger
 * /interactions/drugs:
 *   get:
 *     summary: Search the drug catalog by name, brand, class, or RxCUI
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Matching drug entries
 */
router.get(
  '/drugs',
  validateRequest({ query: lookupDrugQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const drugs = await interactionService.lookup(String(req.query.q));
    return res.json({ status: 'success', data: drugs });
  })
);

/**
 * @swagger
 * /interactions/refresh:
 *   post:
 *     summary: Import the latest bundled CDC/FDA interaction data (CLINIC_ADMIN / SUPER_ADMIN)
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Refresh completed with import counts and versions
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    if (!['CLINIC_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    const result = await interactionService.refresh(String(req.user!.id));
    return res.json({ status: 'success', data: result });
  })
);

/**
 * @swagger
 * /interactions/data-status:
 *   get:
 *     summary: Check freshness of the interaction database
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dataset versions, last import time, and staleness flag
 */
router.get(
  '/data-status',
  asyncHandler(async (_req: Request, res: Response) => {
    const status = await interactionService.dataStatus();
    return res.json({ status: 'success', data: status });
  })
);

/**
 * @swagger
 * /interactions/analytics:
 *   get:
 *     summary: Interaction analytics over recorded checks
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Check volume, alert rate, severity breakdown, top medications
 */
router.get(
  '/analytics',
  validateRequest({ query: analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!['CLINIC_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    const days = Number(req.query.days ?? 30);
    const analytics = await interactionService.analytics(days);
    return res.json({ status: 'success', data: analytics });
  })
);

/**
 * @swagger
 * /interactions/cache:
 *   delete:
 *     summary: Clear the in-memory check cache (SUPER_ADMIN only)
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared
 */
router.delete(
  '/cache',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });
    }
    checkResultCache.clear();
    return res.json({ status: 'success', data: { cleared: true } });
  })
);

export default router;
