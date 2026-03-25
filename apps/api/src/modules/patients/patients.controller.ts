import { Request, Response, Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { PatientModel } from './models/patient.model';

const router = Router();

/**
 * @swagger
 * /patients:
 *   post:
 *     summary: Register a new patient
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, dateOfBirth, sex, contactNumber, address]
 *             properties:
 *               firstName:     { type: string }
 *               lastName:      { type: string }
 *               dateOfBirth:   { type: string, format: date }
 *               sex:           { type: string, enum: [M, F, O] }
 *               contactNumber: { type: string }
 *               address:       { type: string }
 *     responses:
 *       201:
 *         description: Patient created
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

  const patient = await PatientModel.create({ ...req.body, clinicId });
  return res.status(201).json({ status: 'success', data: patient });
});

/**
 * @swagger
 * /patients/search:
 *   get:
 *     summary: Search patients by name
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search term (first or last name)
 *     responses:
 *       200:
 *         description: List of matching patients
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/search', authenticate, async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  const q = req.query.q as string;
  const results = await PatientModel.find({
    clinicId,
    $or: [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
    ],
  }).limit(20);
  return res.json({ status: 'success', data: results });
});

/**
 * @swagger
 * /patients/{id}:
 *   get:
 *     summary: Get a patient by ID
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Patient record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  const patient = await PatientModel.findOne({ _id: req.params.id, clinicId });
  if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: patient });
});

export const patientRoutes = router;
