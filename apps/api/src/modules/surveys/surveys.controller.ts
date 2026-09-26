import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SurveyModel } from './survey.model';
import { surveyResponseSchema } from './survey.validation';
import { asyncHandler } from '@api/utils/asyncHandler';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import logger from '@api/utils/logger';
import { UserModel } from '../auth/models/user.model';

const router = Router();

// Generate unique survey token
function generateSurveyToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── Results dashboard ────────────────────────────────────────────────────────
//
// Definitions (kept here so the dashboard and any exports agree):
//   CSAT — % of completed surveys with overallSatisfaction >= 4 (the "satisfied" top-2-box).
//   NPS  — % promoters − % detractors. The survey captures "would recommend" as a yes/no, so
//          a "yes" counts as a promoter and a "no" as a detractor (range −100…100).

type Bucket = 'day' | 'week' | 'month';

interface ScoreAccumulator {
  responses: number;
  satisfied: number;
  promoters: number;
  detractors: number;
  overallSum: number;
  communicationSum: number;
  waitTimeSum: number;
}

function emptyAcc(): ScoreAccumulator {
  return {
    responses: 0,
    satisfied: 0,
    promoters: 0,
    detractors: 0,
    overallSum: 0,
    communicationSum: 0,
    waitTimeSum: 0,
  };
}

function addToAcc(acc: ScoreAccumulator, r: any): void {
  acc.responses += 1;
  if ((r?.overallSatisfaction ?? 0) >= 4) acc.satisfied += 1;
  if (r?.wouldRecommend) acc.promoters += 1;
  else acc.detractors += 1;
  acc.overallSum += r?.overallSatisfaction ?? 0;
  acc.communicationSum += r?.doctorCommunication ?? 0;
  acc.waitTimeSum += r?.waitTime ?? 0;
}

function scoresFromAcc(acc: ScoreAccumulator) {
  if (acc.responses === 0) {
    return { responses: 0, csat: null, nps: null, avgOverall: null };
  }
  return {
    responses: acc.responses,
    csat: Math.round((acc.satisfied / acc.responses) * 100),
    nps: Math.round(((acc.promoters - acc.detractors) / acc.responses) * 100),
    avgOverall: Number((acc.overallSum / acc.responses).toFixed(2)),
  };
}

function bucketFor(from: Date, to: Date): Bucket {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 31) return 'day';
  if (days <= 184) return 'week';
  return 'month';
}

function bucketStart(d: Date, bucket: Bucket): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (bucket === 'week') {
    // ISO week — start on Monday
    const dow = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - dow);
  } else if (bucket === 'month') {
    x.setUTCDate(1);
  }
  return x.toISOString().slice(0, 10);
}

function nextBucket(key: string, bucket: Bucket): string {
  const x = new Date(`${key}T00:00:00.000Z`);
  if (bucket === 'day') x.setUTCDate(x.getUTCDate() + 1);
  else if (bucket === 'week') x.setUTCDate(x.getUTCDate() + 7);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
}

function parseDateParam(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/v1/surveys/results?from=YYYY-MM-DD&to=YYYY-MM-DD[&doctorId]
// Must be registered before the public /:token routes so "results" isn't treated as a token.
router.get(
  '/results',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const to = parseDateParam(req.query.to, true) ?? now;
    const from = parseDateParam(req.query.from) ?? new Date(to.getTime() - 89 * 86_400_000); // default 90d
    if (from > to) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: '`from` must be on or before `to`' });
    }

    const { doctorId } = req.query as { doctorId?: string };
    const clinicId = req.user!.clinicId;

    const baseFilter: Record<string, any> = { clinicId };
    if (doctorId) baseFilter.doctorId = doctorId;

    const [completed, totalSent] = await Promise.all([
      SurveyModel.find({
        ...baseFilter,
        status: 'completed',
        completedAt: { $gte: from, $lte: to },
      })
        .sort({ completedAt: -1 })
        .lean(),
      SurveyModel.countDocuments({ ...baseFilter, sentAt: { $gte: from, $lte: to } }),
    ]);

    // Overall
    const overall = emptyAcc();
    const bucket = bucketFor(from, to);
    const trendMap = new Map<string, ScoreAccumulator>();
    const providerMap = new Map<string, ScoreAccumulator>();

    for (const s of completed as any[]) {
      addToAcc(overall, s.responses);

      const key = bucketStart(new Date(s.completedAt), bucket);
      if (!trendMap.has(key)) trendMap.set(key, emptyAcc());
      addToAcc(trendMap.get(key)!, s.responses);

      const doc = String(s.doctorId);
      if (!providerMap.has(doc)) providerMap.set(doc, emptyAcc());
      addToAcc(providerMap.get(doc)!, s.responses);
    }

    // Trend — emit every bucket in range so gaps show as gaps, not as interpolated lines
    const trend: Array<{ period: string } & ReturnType<typeof scoresFromAcc>> = [];
    const lastKey = bucketStart(to, bucket);
    for (let k = bucketStart(from, bucket); k <= lastKey; k = nextBucket(k, bucket)) {
      trend.push({ period: k, ...scoresFromAcc(trendMap.get(k) ?? emptyAcc()) });
    }

    // Provider names
    const doctorIds = Array.from(providerMap.keys());
    const doctors = doctorIds.length
      ? await UserModel.find({ _id: { $in: doctorIds } }, { fullName: 1 }).lean()
      : [];
    const nameById = new Map(doctors.map((d: any) => [String(d._id), d.fullName as string]));

    const providers = doctorIds
      .map((id) => {
        const acc = providerMap.get(id)!;
        return {
          doctorId: id,
          name: nameById.get(id) ?? 'Unknown provider',
          ...scoresFromAcc(acc),
          avgCommunication: Number((acc.communicationSum / acc.responses).toFixed(2)),
          avgWaitTime: Number((acc.waitTimeSum / acc.responses).toFixed(2)),
        };
      })
      .sort((a, b) => b.responses - a.responses);

    const comments = (completed as any[])
      .filter((s) => s.responses?.comments && String(s.responses.comments).trim())
      .slice(0, 200)
      .map((s) => ({
        id: String(s._id),
        comment: String(s.responses.comments),
        overallSatisfaction: s.responses.overallSatisfaction,
        wouldRecommend: Boolean(s.responses.wouldRecommend),
        completedAt: s.completedAt,
        doctorId: String(s.doctorId),
        doctorName: nameById.get(String(s.doctorId)) ?? 'Unknown provider',
      }));

    return res.json({
      status: 'success',
      data: {
        range: { from: from.toISOString(), to: to.toISOString(), bucket },
        summary: {
          ...scoresFromAcc(overall),
          totalSent,
          responseRate: totalSent > 0 ? Math.round((overall.responses / totalSent) * 100) : null,
        },
        trend,
        providers,
        comments,
      },
    });
  })
);

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
