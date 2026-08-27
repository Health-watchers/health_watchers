import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { cacheResponse } from '@api/middlewares/cache.middleware';
import {
  reportQuerySchema,
  exportQuerySchema,
  ReportQuery,
  ExportQuery,
} from './reports.validation';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';

const router = Router();
router.use(authenticate, requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

router.get(
  '/overview',
  validateRequest({ query: reportQuerySchema }),
  cacheResponse(900), // 15 min
  async (req: Request<{}, {}, {}, ReportQuery>, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { from, to, period } = req.query;

    // #1070 — Build date range once and reuse across all pipelines
    const dateMatch: any = { clinicId };
    if (from || to) {
      dateMatch.createdAt = {};
      if (from) dateMatch.createdAt.$gte = new Date(from);
      if (to) dateMatch.createdAt.$lte = new Date(to);
    }

    // #1070 — Run all three aggregations in parallel; $match is the first stage
    //         in every pipeline so MongoDB can use the clinicId compound indexes.
    const [patients, encounters, payments] = await Promise.all([
      // Patient pipeline — single $match → $facet (avoids two separate $match stages)
      PatientModel.aggregate([
        { $match: dateMatch },
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [{ $match: { isActive: true } }, { $count: 'count' }],
            // "new" patients are already filtered by dateMatch so no extra $match needed
            new: [{ $count: 'count' }],
          },
        },
      ]).option({ hint: 'clinicId_1_createdAt_-1' }),
      // Encounter pipeline
      EncounterModel.aggregate([
        { $match: dateMatch },
        {
          $facet: {
            total: [{ $count: 'count' }],
            // $cond in a $group avoids separate $match stages for each status bucket
            byStatus: [
              {
                $group: {
                  _id: null,
                  completed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
                  cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                },
              },
            ],
          },
        },
      ]),
      // Payment pipeline — $match first on indexed clinicId, then $facet
      PaymentRecordModel.aggregate([
        { $match: dateMatch },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
                  pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                },
              },
            ],
            totalXLM: [
              {
                $match: { assetCode: 'XLM', status: 'confirmed' },
              },
              { $group: { _id: null, sum: { $sum: { $toDouble: '$amount' } } } },
            ],
          },
        },
      ]),
    ]);

    // AI summaries count — plain countDocuments with indexed clinicId field
    const aiSummaries = await EncounterModel.countDocuments({
      clinicId,
      aiSummary: { $exists: true, $ne: null },
    });

    const encByStatus = encounters[0]?.byStatus?.[0] ?? {};

    res.json({
      status: 'success',
      data: {
        period: period || `${from || 'all'} to ${to || 'now'}`,
        patients: {
          new: patients[0]?.new[0]?.count || 0,
          total: patients[0]?.total[0]?.count || 0,
          active: patients[0]?.active[0]?.count || 0,
        },
        encounters: {
          total: encounters[0]?.total[0]?.count || 0,
          completed: encByStatus.completed || 0,
          cancelled: encByStatus.cancelled || 0,
        },
        payments: {
          total: payments[0]?.summary?.[0]?.total || 0,
          confirmed: payments[0]?.summary?.[0]?.confirmed || 0,
          pending: payments[0]?.summary?.[0]?.pending || 0,
          totalXLM: payments[0]?.totalXLM[0]?.sum?.toFixed(2) || '0.00',
        },
        aiSummaries: { generated: aiSummaries },
      },
    });
  }
);

router.get(
  '/patients',
  validateRequest({ query: reportQuerySchema }),
  cacheResponse(900),
  async (req: Request<{}, {}, {}, ReportQuery>, res: Response) => {
    const clinicId = req.user!.clinicId;

    // #1070 — $match first so MongoDB uses the clinicId_1_createdAt_-1 index.
    //         Both sub-pipelines in $facet inherit the already-filtered document set.
    const demographics = await PatientModel.aggregate([
      { $match: { clinicId } },
      {
        $facet: {
          newByMonth: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 12 },
          ],
          bySex: [{ $group: { _id: '$sex', count: { $sum: 1 } } }],
          byAge: [
            {
              $project: {
                age: {
                  $floor: {
                    $divide: [{ $subtract: [new Date(), '$dateOfBirth'] }, 31557600000],
                  },
                },
              },
            },
            {
              $bucket: {
                groupBy: '$age',
                boundaries: [0, 18, 35, 50, 65, 120],
                default: 'unknown',
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ]).option({ hint: 'clinicId_1_createdAt_-1' });

    const result = demographics[0] ?? { newByMonth: [], bySex: [], byAge: [] };

    res.json({
      status: 'success',
      data: {
        newByMonth: (result.newByMonth ?? []).map((m: any) => ({ month: m._id, count: m.count })),
        demographics: { bySex: result.bySex ?? [], byAge: result.byAge ?? [] },
      },
    });
  }
);

router.get(
  '/encounters',
  validateRequest({ query: reportQuerySchema }),
  cacheResponse(900),
  async (req: Request<{}, {}, {}, ReportQuery>, res: Response) => {
    const clinicId = req.user!.clinicId;

    // #1070 — Single $match → $facet replaces three separate aggregation round-trips.
    const [report] = await EncounterModel.aggregate([
      { $match: { clinicId } },
      {
        $facet: {
          byDoctor: [
            { $group: { _id: '$attendingDoctorId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          topComplaints: [
            { $match: { chiefComplaint: { $exists: true } } },
            { $group: { _id: '$chiefComplaint', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          completionRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]);

    const completionRow = report?.completionRate?.[0];
    const completionRate =
      completionRow?.total > 0
        ? ((completionRow.completed / completionRow.total) * 100).toFixed(1)
        : '0';

    res.json({
      status: 'success',
      data: {
        byDoctor: (report?.byDoctor ?? []).map((d: any) => ({ doctorId: d._id, count: d.count })),
        topComplaints: (report?.topComplaints ?? []).map((c: any) => ({
          complaint: c._id,
          count: c.count,
        })),
        completionRate,
      },
    });
  }
);

router.get(
  '/payments',
  validateRequest({ query: reportQuerySchema }),
  cacheResponse(900),
  async (req: Request<{}, {}, {}, ReportQuery>, res: Response) => {
    const clinicId = req.user!.clinicId;

    // #1070 — Single $match → $facet: three separate aggregation round-trips → one.
    const [report] = await PaymentRecordModel.aggregate([
      { $match: { clinicId } },
      {
        $facet: {
          byMonth: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                count: { $sum: 1 },
                total: { $sum: { $toDouble: '$amount' } },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 12 },
          ],
          successRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
              },
            },
          ],
          byAsset: [
            { $match: { status: 'confirmed' } },
            {
              $group: {
                _id: '$assetCode',
                count: { $sum: 1 },
                total: { $sum: { $toDouble: '$amount' } },
              },
            },
          ],
        },
      },
    ]);

    const successRow = report?.successRate?.[0];
    const successRate =
      successRow?.total > 0
        ? ((successRow.confirmed / successRow.total) * 100).toFixed(1)
        : '0';

    res.json({
      status: 'success',
      data: {
        byMonth: (report?.byMonth ?? []).map((m: any) => ({
          month: m._id,
          count: m.count,
          total: m.total.toFixed(2),
        })),
        successRate,
        byAsset: (report?.byAsset ?? []).map((a: any) => ({
          asset: a._id,
          count: a.count,
          total: a.total.toFixed(2),
        })),
      },
    });
  }
);

router.get(
  '/export',
  validateRequest({ query: exportQuerySchema }),
  async (req: Request<{}, {}, {}, ExportQuery>, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { type, from, to } = req.query;

    const dateFilter = {
      clinicId,
      createdAt: { $gte: new Date(from), $lte: new Date(to) },
    };

    let csv = '';
    if (type === 'patients') {
      const data = await PatientModel.find(dateFilter).lean();
      csv = 'ID,First Name,Last Name,DOB,Sex,Contact\n';
      data.forEach((p: any) => {
        csv += `${p.systemId},${p.firstName},${p.lastName},${p.dateOfBirth},${p.sex},${p.contactNumber}\n`;
      });
    } else if (type === 'encounters') {
      const data = await EncounterModel.find(dateFilter).lean();
      csv = 'ID,Patient ID,Doctor ID,Chief Complaint,Status,Date\n';
      data.forEach((e: any) => {
        csv += `${e._id},${e.patientId},${e.attendingDoctorId},${e.chiefComplaint},${e.status},${e.createdAt}\n`;
      });
    } else if (type === 'payments') {
      const data = await PaymentRecordModel.find(dateFilter).lean();
      csv = 'Intent ID,Amount,Asset,Status,Confirmed At\n';
      data.forEach((p: any) => {
        csv += `${p.intentId},${p.amount},${p.assetCode},${p.status},${p.confirmedAt || ''}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-${to}.csv"`);
    res.send(csv);
  }
);

// GET /api/v1/reports/benchmarks
// Returns anonymized percentile comparison for clinic's metrics
router.get(
  '/benchmarks',
  cacheResponse(3600), // 1 hour
  async (req: Request, res: Response) => {
    try {
      const { getBenchmarkComparison } = await import('./benchmarking.service');
      const benchmark = await getBenchmarkComparison(req.user!.clinicId);
      return res.json(benchmark);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'BenchmarkCalculationError', message: msg });
    }
  }
);

// POST /api/v1/ai/benchmark-insights
// Get AI-powered insights on clinic's benchmark position
router.post('/benchmark-insights', async (req: Request, res: Response) => {
  try {
    const { isAIServiceAvailable, stripPII } = await import('../ai/ai.service');
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured.',
      });
    }

    const { getBenchmarkComparison } = await import('./benchmarking.service');
    const benchmark = await getBenchmarkComparison(req.user!.clinicId);

    const benchmarkSummary = benchmark.comparisons
      .map(
        (c) =>
          `${c.metric}: clinic=${c.clinicValue}, p50=${c.percentiles.p50}, rank=${c.percentileRank}%`
      )
      .join('\n');

    const prompt = `You are a healthcare operations consultant. Analyze the following clinic's benchmark position and provide 2-3 actionable recommendations to improve performance.

Clinic Category: ${benchmark.category}
Benchmark Metrics:
${benchmarkSummary}

Provide concise, actionable recommendations:`;

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { config } = await import('@health-watchers/config');
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const insights = result.response.text();

    return res.json({
      success: true,
      clinicId: req.user!.clinicId,
      category: benchmark.category,
      insights,
      disclaimer:
        'AI-generated insights for operational guidance only. Not a substitute for professional consulting.',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'InsightGenerationError', message: msg });
  }
});

// GET /reports/outcomes — outcome analytics
router.get('/outcomes', async (req: Request, res: Response, next) => {
  try {
    const clinicId = req.user!.clinicId;
    const { from, to } = req.query as { from?: string; to?: string };

    const dateFilter: Record<string, unknown> = { clinicId };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      dateFilter.createdAt = range;
    }

    const [outcomeDistribution, followUpStats, avgResolution] = await Promise.all([
      EncounterModel.aggregate([
        { $match: { ...dateFilter, outcome: { $exists: true, $ne: null } } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
        { $project: { outcome: '$_id', count: 1, _id: 0 } },
      ]),
      EncounterModel.aggregate([
        { $match: { ...dateFilter, followUpRequired: true } },
        { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: ['$followUpCompleted', 1, 0] } } } },
      ]),
      EncounterModel.aggregate([
        { $match: { ...dateFilter, outcome: 'resolved', followUpDate: { $exists: true } } },
        { $group: { _id: null, avgDays: { $avg: { $divide: [{ $subtract: ['$followUpDate', '$createdAt'] }, 86400000] } } } },
      ]),
    ]);

    const followUpRow = followUpStats[0];
    const followUpComplianceRate =
      followUpRow && followUpRow.total > 0
        ? Math.round((followUpRow.completed / followUpRow.total) * 100)
        : null;

    const avgDaysToResolution =
      avgResolution[0]?.avgDays != null ? Math.round(avgResolution[0].avgDays * 10) / 10 : null;

    return res.json({
      status: 'success',
      data: { outcomeDistribution, followUpComplianceRate, avgDaysToResolution },
    });
  } catch (err) {
    next(err);
  }
});

export const reportRoutes = router;
