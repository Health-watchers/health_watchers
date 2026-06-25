import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { BAAModel } from './baa.model';
import { BreachNotificationModel } from './breach.model';
import logger from '../../utils/logger';

const router = Router();

// GET /api/v1/compliance/baas - List all BAAs for clinic
router.get(
  '/baas',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const baas = await BAAModel.find({ clinicId: req.user!.clinicId }).sort({ createdAt: -1 });
      res.json(baas);
    } catch (err) {
      logger.error('Error fetching BAAs:', err);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/compliance/baas - Create/update BAA
router.post(
  '/baas',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
     const { businessAssociate, status, signedDate, expiryDate, documentUrl, notes } = req.body;

      if (!businessAssociate || typeof businessAssociate !== 'string') {
        return res
          .status(400)
          .json({ error: 'ValidationError', message: 'businessAssociate is required' });
      }

      const safeBusinessAssociate = String(businessAssociate).slice(0, 500);
      const baa = await BAAModel.findOneAndUpdate(
        { clinicId: req.user!.clinicId, businessAssociate: safeBusinessAssociate },
        {
          status,
          signedDate,
          expiryDate,
          documentUrl,
          notes,
        },
        { upsert: true, new: true }
      );

      res.json(baa);
    } catch (err) {
      logger.error('Error creating/updating BAA:', err);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/compliance/breaches - List breach notifications
router.get(
  '/breaches',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const breaches = await BreachNotificationModel.find({ clinicId: req.user!.clinicId }).sort({
        detectedAt: -1,
      });
      res.json(breaches);
    } catch (err) {
      logger.error('Error fetching breaches:', err);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/compliance/breaches - Report a breach
router.post(
  '/breaches',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { breachType, description, affectedRecords } = req.body;

      if (!breachType || !description || !affectedRecords) {
        return res
          .status(400)
          .json({
            error: 'ValidationError',
            message: 'breachType, description, and affectedRecords are required',
          });
      }

      const detectedAt = new Date();
      const notificationDeadline = new Date(detectedAt.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const breach = await BreachNotificationModel.create({
        clinicId: req.user!.clinicId,
        breachType,
        description,
        affectedRecords,
        detectedAt,
        notificationDeadline,
        status: 'detected',
      });

      logger.warn(`[HIPAA] Breach detected for clinic ${req.user!.clinicId}: ${breachType}`);
      res.status(201).json(breach);
    } catch (err) {
      logger.error('Error reporting breach:', err);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

export const complianceRoutes = router;
