import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { aiLimiter, exportRateLimit } from '../../middlewares/rate-limit.middleware';
import { auditMiddleware } from '../../middlewares/audit.middleware';
import {
  calculatePopulationMetrics,
  generatePopulationInsights,
  detectOutbreaks,
  getPopulationTrends,
  getRiskCohorts,
  buildAnonymizedExport,
} from './population-health.service';
import { PopulationHealthModel } from './population-health.model';
import { EncounterModel } from '../encounters/encounter.model';
import logger from '../../utils/logger';

const router = Router();

interface CohortFilters {
  ageGroup?: string;
  gender?: string;
  clinicBranch?: string;
}

function parseCohortFilters(req: Request): CohortFilters {
  const filters: CohortFilters = {};
  if (typeof req.query.ageGroup === 'string' && req.query.ageGroup) {
    filters.ageGroup = req.query.ageGroup;
  }
  if (typeof req.query.gender === 'string' && req.query.gender) {
    filters.gender = req.query.gender;
  }
  if (typeof req.query.clinicBranch === 'string' && req.query.clinicBranch) {
    filters.clinicBranch = req.query.clinicBranch;
  }
  return filters;
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// GET /api/v1/ai/population-health - Get population health metrics and insights
router.get(
  '/population-health',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);
      const filters = parseCohortFilters(req);
      const hasFilters = Object.keys(filters).length > 0;

      // Check if recent insights exist (within 7 days)
      const recentInsight = await PopulationHealthModel.findOne({
        clinicId,
        generatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }).sort({ generatedAt: -1 });

      if (recentInsight && !hasFilters) {
        return res.json(recentInsight);
      }

      // Calculate metrics
      const metrics = await calculatePopulationMetrics(clinicId, filters);

      // Generate AI insights
      const aiInsights = await generatePopulationInsights(clinicId, metrics);

      // Detect outbreaks
      const encounters = await EncounterModel.find({ clinicId });
      const outbreakAlerts = await detectOutbreaks(clinicId, encounters);

      // Save insights (only for unfiltered, clinic-wide calculations)
      if (!hasFilters) {
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
      }

      return res.json({
        clinicId,
        generatedAt: new Date(),
        filters,
        metrics,
        aiInsights,
        outbreakAlerts,
      });
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

// GET /api/v1/ai/population-health/trends - Time-series metrics for line charts
router.get(
  '/population-health/trends',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);
      const filters = parseCohortFilters(req);
      const months = Math.min(parseInt(req.query.months as string) || 12, 36);

      const trends = await getPopulationTrends(clinicId, filters, months);
      return res.json(trends);
    } catch (err) {
      logger.error(`Error fetching population health trends: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/ai/population-health/risk-cohorts - High-risk cohorts from risk stratification
router.get(
  '/population-health/risk-cohorts',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);
      const filters = parseCohortFilters(req);

      const cohorts = await getRiskCohorts(clinicId, filters);
      return res.json(cohorts);
    } catch (err) {
      logger.error(`Error fetching risk cohorts: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

// GET /api/v1/ai/population-health/export.csv - Anonymized CSV export for research
router.get(
  '/population-health/export.csv',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  exportRateLimit,
  auditMiddleware('POPULATION_HEALTH_EXPORT'),
  async (req: Request, res: Response) => {
    try {
      const clinicId = String(req.user!.clinicId);
      const filters = parseCohortFilters(req);

      const rows = await buildAnonymizedExport(clinicId, filters);

      const headers = [
        'cohort',
        'ageGroup',
        'gender',
        'clinicBranch',
        'diagnosis',
        'prevalenceRate',
        'vaccinationCoverage',
        'chronicDiseaseRate',
        'riskLevel',
        'patientCount',
      ];

      const lines: string[] = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(','));
      }

      const csv = lines.join('\r\n');
      const filename = `population-health-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (err) {
      logger.error(`Error exporting population health data: ${err}`);
      return res.status(500).json({ error: 'InternalServerError' });
    }
  }
);

export const populationHealthRoutes = router;
