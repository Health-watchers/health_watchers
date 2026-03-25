import { Request, Response, Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { EncounterModel } from './encounter.model';

const router = Router();

/**
 * @swagger
 * /encounters:
 *   post:
 *     summary: Log a new clinical encounter
 *     tags: [Encounters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, chiefComplaint]
 *             properties:
 *               patientId:      { type: string, description: Patient ObjectId }
 *               chiefComplaint: { type: string }
 *               notes:          { type: string }
 *     responses:
 *       201:
 *         description: Encounter created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) return res.status(401).json({ error: 'Unauthorized' });

  const encounter = await EncounterModel.create({ ...req.body, clinicId });
  return res.status(201).json({ status: 'success', data: encounter });
});

/**
 * @swagger
 * /encounters/patient/{patientId}:
 *   get:
 *     summary: Get all encounters for a patient
 *     tags: [Encounters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string }
 *         description: Patient ObjectId
 *     responses:
 *       200:
 *         description: List of encounters
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  const encounters = await EncounterModel.find({
    patientId: req.params.patientId,
    clinicId: req.user?.clinicId,
  }).sort({ createdAt: -1 });
  return res.json({ status: 'success', data: encounters });
});

/**
 * @swagger
 * /encounters/{id}:
 *   get:
 *     summary: Get an encounter by ID
 *     tags: [Encounters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Encounter ObjectId
 *     responses:
 *       200:
 *         description: Encounter record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Encounter not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const encounter = await EncounterModel.findOne({ _id: req.params.id, clinicId: req.user?.clinicId });
  if (!encounter) return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
  return res.json({ status: 'success', data: encounter });
});

export const encounterRoutes = router;
