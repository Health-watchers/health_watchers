import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SurveyModel } from './survey.model';
import { surveyResponseSchema } from './survey.validation';
import { asyncHandler } from '@api/utils/asyncHandler';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';

const router = Router();

// Generate unique survey token
function generateSurveyToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/v1/surveys/:token/submit (public, no auth required)
router.post(
  '/:token/submit',
  validateRequest({ body: surveyResponseSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const responses = req.body;

    const survey = await SurveyModel.findOne({ token });
    if (!survey) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Survey not found',
      });
    }

    if (survey.status === 'completed') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Survey already completed',
      });
    }

    if (survey.status === 'expired' || new Date() > survey.expiresAt) {
      survey.status = 'expired';
      await survey.save();
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Survey has expired',
      });
    }

    survey.responses = responses;
    survey.status = 'completed';
    survey.completedAt = new Date();
    await survey.save();

    logger.info(
      { surveyId: String(survey._id), encounterId: String(survey.encounterId) },
      'Survey completed'
    );

    return res.json({
      status: 'success',
      data: {
        message: 'Thank you for completing the survey!',
        surveyId: String(survey._id),
      },
    });
  })
);

// GET /api/v1/surveys/:token (public, no auth required)
router.get(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const survey = await SurveyModel.findOne({ token });
    if (!survey) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Survey not found',
      });
    }

    if (survey.status === 'expired' || new Date() > survey.expiresAt) {
      survey.status = 'expired';
      await survey.save();
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Survey has expired',
      });
    }

    return res.json({
      status: 'success',
      data: {
        id: String(survey._id),
        status: survey.status,
        expiresAt: survey.expiresAt,
        responses: survey.responses,
      },
    });
  })
);

// GET /api/v1/reports/satisfaction (authenticated, CLINIC_ADMIN only)
router.get(
  '/reports/satisfaction',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { doctorId, startDate, endDate } = req.query;

    const filter: Record<string, any> = {
      clinicId: req.user!.clinicId,
      status: 'completed',
    };

    if (doctorId) filter.doctorId = doctorId;
    if (startDate || endDate) {
      filter.completedAt = {};
      if (startDate) filter.completedAt.$gte = new Date(String(startDate));
      if (endDate) filter.completedAt.$lte = new Date(String(endDate));
    }

    const surveys = await SurveyModel.find(filter).lean();

    if (surveys.length === 0) {
      return res.json({
        status: 'success',
        data: {
          averageScores: null,
          nps: null,
          totalResponses: 0,
          doctorScores: [],
        },
      });
    }

    // Calculate average scores
    const avgOverall =
      surveys.reduce((sum: number, s: any) => sum + (s.responses?.overallSatisfaction || 0), 0) /
      surveys.length;
    const avgWaitTime =
      surveys.reduce((sum: number, s: any) => sum + (s.responses?.waitTime || 0), 0) /
      surveys.length;
    const avgCommunication =
      surveys.reduce((sum: number, s: any) => sum + (s.responses?.doctorCommunication || 0), 0) /
      surveys.length;
    const avgStaff =
      surveys.reduce((sum: number, s: any) => sum + (s.responses?.staffFriendliness || 0), 0) /
      surveys.length;
    const avgCleanness =
      surveys.reduce((sum: number, s: any) => sum + (s.responses?.facilityCleanness || 0), 0) /
      surveys.length;

    // Calculate NPS (Net Promoter Score)
    const promoters = surveys.filter((s: any) => s.responses?.wouldRecommend).length;
    const nps = Math.round((promoters / surveys.length) * 100);

    // Doctor-specific scores
    const doctorScoresMap = new Map<string, any>();
    surveys.forEach((s: any) => {
      const docId = String(s.doctorId);
      if (!doctorScoresMap.has(docId)) {
        doctorScoresMap.set(docId, {
          doctorId: docId,
          surveys: [],
          scores: [],
        });
      }
      const entry = doctorScoresMap.get(docId);
      entry.surveys.push(s);
      entry.scores.push(s.responses?.overallSatisfaction || 0);
    });

    const doctorScores = Array.from(doctorScoresMap.values()).map((entry: any) => ({
      doctorId: entry.doctorId,
      averageScore: (
        entry.scores.reduce((a: number, b: number) => a + b, 0) / entry.scores.length
      ).toFixed(2),
      totalSurveys: entry.surveys.length,
    }));

    return res.json({
      status: 'success',
      data: {
        averageScores: {
          overall: avgOverall.toFixed(2),
          waitTime: avgWaitTime.toFixed(2),
          doctorCommunication: avgCommunication.toFixed(2),
          staffFriendliness: avgStaff.toFixed(2),
          facilityCleanness: avgCleanness.toFixed(2),
        },
        nps,
        totalResponses: surveys.length,
        doctorScores,
      },
    });
  })
);

export const surveyRoutes = router;
