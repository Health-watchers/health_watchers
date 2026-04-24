import { Router, Request, Response } from 'express';
import { LabResultModel } from './lab-result.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
router.use(authenticate);

const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const RESULT_ENTRY_ROLES = requireRoles('DOCTOR', 'NURSE');

// POST /api/v1/lab-results — Order a lab test
router.post(
  '/',
  CLINICAL_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, encounterId, testName, testCode, notes } = req.body;
    if (!patientId || !testName) {
      return res.status(400).json({ error: 'ValidationError', message: 'patientId and testName are required' });
    }
    const doc = await LabResultModel.create({
      patientId,
      encounterId,
      clinicId: req.user!.clinicId,
      orderedBy: req.user!.userId,
      testName,
      testCode,
      notes,
      status: 'ordered',
      orderedAt: new Date(),
    });
    return res.status(201).json({ status: 'success', data: doc });
  }),
);

// GET /api/v1/lab-results — List lab results (filter by patient, status, date)
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, from, to } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    if (from || to) {
      filter.orderedAt = {};
      if (from) (filter.orderedAt as any).$gte = new Date(from);
      if (to) (filter.orderedAt as any).$lte = new Date(to);
    }
    const docs = await LabResultModel.find(filter).sort({ orderedAt: -1 });
    return res.json({ status: 'success', data: docs });
  }),
);

// GET /api/v1/lab-results/:id — Get lab result details
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    return res.json({ status: 'success', data: doc });
  }),
);

// PUT /api/v1/lab-results/:id/results — Enter lab results (DOCTOR/NURSE)
router.put(
  '/:id/results',
  RESULT_ENTRY_ROLES,
  asyncHandler(async (req: Request, res: Response) => {
    const { results, notes, attachmentUrl } = req.body;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'results array is required' });
    }
    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      { results, notes, attachmentUrl, status: 'resulted', resultedAt: new Date() },
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });

    // Check for critical flags
    const criticalFlags = results.filter((r: any) => r.flag === 'HH' || r.flag === 'LL');
    return res.json({
      status: 'success',
      data: doc,
      ...(criticalFlags.length > 0 && {
        alert: { critical: true, parameters: criticalFlags.map((r: any) => r.parameter) },
      }),
    });
  }),
);

export const labResultRoutes = router;
