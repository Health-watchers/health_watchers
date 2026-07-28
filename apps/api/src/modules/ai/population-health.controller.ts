import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { aiLimiter } from '../../middlewares/rate-limit.middleware';
import {
  calculatePopulationMetrics,
  generatePopulationInsights,
  detectOutbreaks,
} from './population-health.service';
import { PopulationHealthModel } from './population-health.model';
import { EncounterModel } from '../encounters/encounter.model';
import logger from '../../utils/logger';

const router = Router();

// GET /api/v1/ai/population-health - Get population health metrics and insights
router.get(
  '/population-health',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);

      // Check if recent insights exist (within 7 days)
      const recentInsight = await PopulationHealthModel.findOne({
        clinicId,
        generatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }).sort({ generatedAt: -1 });

      if (recentInsight) {
        return res.json(recentInsight);
      }

      // Calculate metrics
      const metrics = await calculatePopulationMetrics(clinicId);

      // Generate AI insights
      const aiInsights = await generatePopulationInsights(clinicId, metrics);

      // Detect outbreaks
      const encounters = await EncounterModel.find({ clinicId });
      const outbreakAlerts = await detectOutbreaks(clinicId, encounters);

      // Save insights
      const insight = await PopulationHealthModel.create({
        clinicId,
        generatedAt: new Date(),
        metrics,
        aiInsights,
        outbreakAlerts,
      });

      // Alert CLINIC_ADMIN if outbreak detected
      if (outbreakAlerts.detected) {
        logger.warn(
          `[Population Health] Outbreak detected for clinic ${clinicId}: ${outbreakAlerts.diagnosis} (${outbreakAlerts.count} cases)`
        );
      }

      return res.json(insight);
    } catch (err) {
      logger.error(`Error generating population health insights: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// POST /api/v1/ai/population-insights - Force regenerate insights
router.post(
  '/population-insights',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);

      // Calculate metrics
      const metrics = await calculatePopulationMetrics(clinicId);

      // Generate AI insights
      const aiInsights = await generatePopulationInsights(clinicId, metrics);

      // Detect outbreaks
      const encounters = await EncounterModel.find({ clinicId });
      const outbreakAlerts = await detectOutbreaks(clinicId, encounters);

      // Save insights
      const insight = await PopulationHealthModel.create({
        clinicId,
        generatedAt: new Date(),
        metrics,
        aiInsights,
        outbreakAlerts,
      });

      res.json(insight);
    } catch (err) {
      logger.error(`Error generating population insights: ${err}`);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/ai/population-health/history - Get historical insights
router.get(
  '/population-health/history',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const insights = await PopulationHealthModel.find({ clinicId })
        .sort({ generatedAt: -1 })
        .limit(limit);

      res.json(insights);
    } catch (err) {
      logger.error(`Error fetching population health history: ${err}`);
      res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

export const populationHealthRoutes = router;
