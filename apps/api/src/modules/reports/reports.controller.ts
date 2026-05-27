import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { cacheResponse } from '@api/middlewares/cache.middleware';
import { reportQuerySchema, exportQuerySchema, ReportQuery, ExportQuery } from './reports.validation';
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
    
    const dateFilter: any = { clinicId };
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to) dateFilter.createdAt.$lte = new Date(to);
    }

    const [patients, encounters, payments] = await Promise.all([
      PatientModel.aggregate([
        { $match: dateFilter },
        {
          $facet: {
            new: [{ $match: { createdAt: dateFilter.createdAt } }, { $count: 'count' }],
            total: [{ $count: 'count' }],
            active: [{ $match: { isActive: true } }, { $count: 'count' }],
          },
        },
      ]),
      EncounterModel.aggregate([
        { $match: dateFilter },
        {
          $facet: {
            total: [{ $count: 'count' }],
            completed: [{ $match: { status: 'closed' } }, { $count: 'count' }],
            cancelled: [{ $match: { status: 'cancelled' } }, { $count: 'count' }],
          },
        },
      ]),
      PaymentRecordModel.aggregate([
        { $match: dateFilter },
        {
          $facet: {
            total: [{ $count: 'count' }],
            confirmed: [{ $match: { status: 'confirmed' } }, { $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            totalXLM: [
              { $match: { assetCode: 'XLM', status: 'confirmed' } },
              { $group: { _id: null, sum: { $sum: { $toDouble: '$amount' } } } },
            ],
          },
        },
      ]),
    ]);

    const aiSummaries = await EncounterModel.countDocuments({
      clinicId,
      aiSummary: { $exists: true, $ne: null },
    });

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
          completed: encounters[0]?.completed[0]?.count || 0,
          cancelled: encounters[0]?.cancelled[0]?.count || 0,
        },
        payments: {
          total: payments[0]?.total[0]?.count || 0,
          confirmed: payments[0]?.confirmed[0]?.count || 0,
          pending: payments[0]?.pending[0]?.count || 0,
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

    const newByMonth = await PatientModel.aggregate([
      { $match: { clinicId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ]);

    const demographics = await PatientModel.aggregate([
      { $match: { clinicId } },
      {
        $facet: {
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
    ]);

    res.json({
      status: 'success',
      data: {
        newByMonth: newByMonth.map((m) => ({ month: m._id, count: m.count })),
        demographics: demographics[0],
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

    const byDoctor = await EncounterModel.aggregate([
      { $match: { clinicId } },
      { $group: { _id: '$attendingDoctorId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const topComplaints = await EncounterModel.aggregate([
      { $match: { clinicId, chiefComplaint: { $exists: true } } },
      { $group: { _id: '$chiefComplaint', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const completionRate = await EncounterModel.aggregate([
      { $match: { clinicId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        },
      },
    ]);

    res.json({
      status: 'success',
      data: {
        byDoctor: byDoctor.map((d) => ({ doctorId: d._id, count: d.count })),
        topComplaints: topComplaints.map((c) => ({ complaint: c._id, count: c.count })),
        completionRate:
          completionRate[0]?.total > 0
            ? ((completionRate[0].completed / completionRate[0].total) * 100).toFixed(1)
            : '0',
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

    const byMonth = await PaymentRecordModel.aggregate([
      { $match: { clinicId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
          total: { $sum: { $toDouble: '$amount' } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ]);

    const successRate = await PaymentRecordModel.aggregate([
      { $match: { clinicId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
        },
      },
    ]);

    const byAsset = await PaymentRecordModel.aggregate([
      { $match: { clinicId, status: 'confirmed' } },
      {
        $group: {
          _id: '$assetCode',
          count: { $sum: 1 },
          total: { $sum: { $toDouble: '$amount' } },
        },
      },
    ]);

    res.json({
      status: 'success',
      data: {
        byMonth: byMonth.map((m) => ({ month: m._id, count: m.count, total: m.total.toFixed(2) })),
        successRate:
          successRate[0]?.total > 0
            ? ((successRate[0].confirmed / successRate[0].total) * 100).toFixed(1)
            : '0',
        byAsset: byAsset.map((a) => ({ asset: a._id, count: a.count, total: a.total.toFixed(2) })),
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
router.post(
  '/benchmark-insights',
  async (req: Request, res: Response) => {
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
  }
);

export const reportRoutes = router;
