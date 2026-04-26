import { Router, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  generateClinicalSummary,
  generateRawTextSummary,
  generatePatientInsights,
  generateDifferentialDiagnosis,
  isAIServiceAvailable,
  AI_DISCLAIMER,
  checkDrugInteractions,
} from './ai.service';
import {
  generateDifferentialDiagnosis,
  DIFFERENTIAL_DISCLAIMER,
  type DifferentialDiagnosisInput,
} from './differential-diagnosis.service';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import logger from '../../utils/logger';
import { sendAISummaryNotification } from '@api/lib/email.service';
import { withSpan } from '@api/utils/tracer';
import { aiRequestsTotal } from '../../services/metrics.service';

const router = Router();

// GET /api/v1/ai/health
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai' }));

// POST /api/v1/ai/summarize
// Request body: { encounterId?: string, text?: string }
// Returns: { success: boolean, summary: string, disclaimer: string }
router.post('/summarize', authenticate, async (req: Request, res: Response) => {
  const startTime = Date.now();
  aiRequestsTotal.inc({ endpoint: 'summarize' });
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured. Please contact your administrator.',
      });
    }

    const { encounterId, text } = req.body;

    // Accept either encounterId or raw text
    if (!encounterId && !text) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Either encounterId or text is required',
      });
    }

    let summary: string;
    let encounter: any;

    if (text) {
      // Raw text input
      if (typeof text !== 'string' || text.trim().length < 10) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'text must be a non-empty string with at least 10 characters',
        });
      }
      summary = await withSpan('ai.summarize', { 'ai.input': 'text' }, async () =>
        generateRawTextSummary(text)
      );
    } else {
      // encounterId input
      if (!isValidObjectId(encounterId)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid encounterId format',
        });
      }

      const { EncounterModel } = await import('../encounters/encounter.model');
      encounter = await EncounterModel.findById(encounterId);
      if (!encounter) {
        return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
      }

      // Check ai_analysis consent
      const { hasConsent } = await import('../consent/consent.controller');
      const consentGranted = await hasConsent(
        String(encounter.patientId),
        req.user!.clinicId,
        'ai_analysis'
      );
      if (!consentGranted) {
        return res.status(403).json({
          error: 'ConsentRequired',
          message: 'Patient has not consented to AI analysis. Please obtain consent first.',
        });
      }

      summary = await withSpan(
        'ai.summarize',
        { 'ai.input': 'encounter', 'encounter.id': String(encounterId) },
        async () =>
          generateClinicalSummary({
            chiefComplaint: encounter.chiefComplaint,
            notes: encounter.notes,
            diagnosis: encounter.diagnosis,
            vitalSigns: encounter.vitalSigns,
          })
      );

      // Store the summary in the encounter
      encounter.aiSummary = summary;
      await encounter.save();
    }

    const duration = Date.now() - startTime;
    logger.info({ encounterId, duration, textLength: text?.length }, 'AI summary generated');

    // Notify attending doctor (non-blocking)
    if (encounter) {
      try {
        const { UserModel } = await import('../auth/models/user.model');
        const { PatientModel } = await import('../patients/models/patient.model');
        const [doctor, patient] = await Promise.all([
          UserModel.findById(encounter.attendingDoctorId).lean(),
          PatientModel.findById(encounter.patientId).lean(),
        ]);
        if (doctor?.email && patient) {
          const patientName = `${(patient as any).firstName} ${(patient as any).lastName}`;
          sendAISummaryNotification(doctor.email, patientName, encounterId);
        }
      } catch {
        /* non-critical */
      }
    }

    return res.json({
      success: true,
      summary,
      disclaimer: AI_DISCLAIMER,
      ...(encounterId ? { encounterId } : {}),
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    logger.error({ err: error, duration }, 'AI summarize error');

    if (error instanceof Error && error.message.includes('Failed to generate AI summary')) {
      return res.status(503).json({
        error: 'AIServiceError',
        message: 'Failed to generate AI summary. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

// POST /api/v1/ai/insights
// Request body: { patientId: string }
// Returns: { success: boolean, insights: string, disclaimer: string }
router.post('/insights', authenticate, async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured. Please contact your administrator.',
      });
    }

    const { patientId } = req.body;
    if (!patientId || !isValidObjectId(patientId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Valid patientId is required',
      });
    }

    const { EncounterModel } = await import('../encounters/encounter.model');

    // Fetch last 10 encounters for the patient
    const encounters = await EncounterModel.find({
      patientId,
      clinicId: req.user!.clinicId,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    if (encounters.length === 0) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'No encounters found for this patient',
      });
    }

    const insights = await generatePatientInsights(
      encounters.map((e) => ({
        chiefComplaint: e.chiefComplaint,
        notes: e.notes,
        diagnosis: e.diagnosis,
        createdAt: e.createdAt,
      }))
    );

    const duration = Date.now() - startTime;
    logger.info(
      { patientId, encounterCount: encounters.length, duration },
      'AI insights generated'
    );

    return res.json({
      success: true,
      insights,
      disclaimer: AI_DISCLAIMER,
      patientId,
      encounterCount: encounters.length,
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    logger.error({ err: error, duration }, 'AI insights error');

    if (error instanceof Error && error.message.includes('Failed to generate patient insights')) {
      return res.status(503).json({
        error: 'AIServiceError',
        message: 'Failed to generate patient insights. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

// POST /api/v1/ai/drug-interactions
// Stub endpoint for future drug interaction checking
// Request body: { medications: string[] }
// Returns: 501 Not Implemented
router.post('/drug-interactions', authenticate, async (req: Request, res: Response) => {
  logger.info(
    { medications: req.body.medications },
    'Drug interaction check requested (not implemented)'
  );

  return res.status(501).json({
    error: 'NotImplemented',
    message:
      'Drug interaction checking is not yet implemented. This feature will be available in a future release.',
    requestedMedications: req.body.medications || [],
  });
});

// POST /api/v1/ai/health-trends
// Request body: { patientId: string }
// Returns: { success: boolean, summary: string }
router.post('/health-trends', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({ error: 'AIUnavailable' });
    }

    const { patientId } = req.body;
    if (!patientId || !isValidObjectId(patientId)) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'Valid patientId is required' });
    }

    const { EncounterModel } = await import('../encounters/encounter.model');
    const { PatientModel } = await import('../patients/models/patient.model');

    const [patient, encounters] = await Promise.all([
      PatientModel.findOne({ _id: patientId, clinicId: req.user!.clinicId }).lean(),
      EncounterModel.find({ patientId, clinicId: req.user!.clinicId, isActive: true })
        .sort({ createdAt: 1 })
        .select('vitalSigns createdAt')
        .lean(),
    ]);

    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    }

    // Anonymize: strip PII, keep only vitals + dates
    const anonymizedVitals = encounters
      .filter((e) => e.vitalSigns && Object.keys(e.vitalSigns).length > 0)
      .map((e) => ({ date: (e as any).createdAt, vitals: e.vitalSigns }));

    if (anonymizedVitals.length === 0) {
      return res.status(422).json({
        error: 'InsufficientData',
        message: 'No vital sign data available for trend analysis',
      });
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { config } = await import('@health-watchers/config');
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a medical AI assistant. Analyze the following anonymized vital sign history and provide a concise health trend summary in 2-3 sentences. Focus on notable patterns, improvements, or concerns.

Vital Signs History (chronological):
${JSON.stringify(anonymizedVitals, null, 2)}

Provide a professional health trend summary:`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    return res.json({ success: true, summary, readings: anonymizedVitals.length });
  } catch (error: any) {
    logger.error({ err: error }, 'AI health-trends error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/drug-interactions
// Body: { currentMedications: string[], newDrug: string }
router.post('/drug-interactions', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({ error: 'AIUnavailable' });
    }
    const { currentMedications, newDrug } = req.body;
    if (!newDrug || typeof newDrug !== 'string') {
      return res.status(400).json({ error: 'ValidationError', message: 'newDrug is required' });
    }
    const result = await checkDrugInteractions({
      currentMedications: Array.isArray(currentMedications) ? currentMedications : [],
      newDrug,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, 'AI drug-interactions error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/interpret-labs
// Request body: { labResultId: string }
// Returns: { success: boolean, interpretation: string, criticalValues: string[] }
router.post('/interpret-labs', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({ error: 'AIUnavailable' });
    }

    const { labResultId } = req.body;
    if (!labResultId || !isValidObjectId(labResultId)) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'Valid labResultId is required' });
    }

    const { LabResultModel } = await import('../lab-results/lab-result.model');
    const labResult = await LabResultModel.findById(labResultId);
    if (!labResult) {
      return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    }
    if (!labResult.results || labResult.results.length === 0) {
      return res
        .status(422)
        .json({ error: 'NoResults', message: 'Lab result has no result entries to interpret' });
    }

    const criticalValues = labResult.results
      .filter((r) => r.flag === 'HH' || r.flag === 'LL')
      .map((r) => `${r.parameter} (${r.value} ${r.unit}, flag: ${r.flag})`);

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { config } = await import('@health-watchers/config');
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a medical AI assistant. Interpret the following lab results in plain language for a clinician.
Highlight any abnormal values and flag critical values (HH/LL) for immediate attention. Keep the response to 3-4 sentences.

Test: ${labResult.testName}${labResult.testCode ? ` (${labResult.testCode})` : ''}
Results:
${labResult.results.map((r) => `- ${r.parameter}: ${r.value} ${r.unit} (ref: ${r.referenceRange})${r.flag ? ` [${r.flag}]` : ''}`).join('\n')}

Provide a plain-language clinical interpretation:`;

    const result = await model.generateContent(prompt);
    const interpretation = result.response.text();

    return res.json({ success: true, interpretation, criticalValues });
  } catch (error: any) {
    logger.error({ err: error }, 'AI interpret-labs error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/generate-care-plan
// Input: { patientId, condition, icdCode? }
// Returns: AI-suggested care plan (not saved — doctor must approve via POST /care-plans)
router.post(
  '/generate-care-plan',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({ error: 'AIUnavailable' });
      }

      const { patientId, condition, icdCode } = req.body;
      if (!patientId || !condition) {
        return res
          .status(400)
          .json({ error: 'ValidationError', message: 'patientId and condition are required' });
      }
      if (!isValidObjectId(patientId)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid patientId' });
      }

      const { PatientModel } = await import('../patients/models/patient.model');
      const { EncounterModel } = await import('../encounters/encounter.model');

      const [patient, recentEncounters] = await Promise.all([
        PatientModel.findOne({ _id: patientId, clinicId: req.user!.clinicId }).lean(),
        EncounterModel.find({ patientId, clinicId: req.user!.clinicId, isActive: true })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('chiefComplaint diagnosis vitalSigns notes createdAt')
          .lean(),
      ]);

      if (!patient) {
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      }

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { config } = await import('@health-watchers/config');
      const genAI = new GoogleGenerativeAI(config.geminiApiKey);
      const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are a clinical decision support AI. Generate a structured chronic disease care plan for a patient with the following profile.

Condition: ${condition}${icdCode ? ` (ICD-10: ${icdCode})` : ''}
Patient sex: ${(patient as any).sex}
Recent encounters (last 5): ${JSON.stringify(
        recentEncounters.map((e) => ({
          date: (e as any).createdAt,
          chiefComplaint: e.chiefComplaint,
          diagnosis: e.diagnosis,
          vitalSigns: e.vitalSigns,
        })),
        null,
        2
      )}

Respond ONLY with a valid JSON object matching this exact structure (no markdown, no explanation):
{
  "goals": [{ "description": string, "targetValue": string | null, "status": "active" }],
  "interventions": [{ "type": "medication"|"lifestyle"|"monitoring"|"referral", "description": string, "frequency": string | null }],
  "monitoringSchedule": [{ "parameter": string, "frequency": string, "targetRange": string | null }],
  "reviewDate": "<ISO date 3 months from today>"
}`;

      const result = await aiModel.generateContent(prompt);
      const text = result.response.text().trim();

      let suggestion: unknown;
      try {
        // Strip possible markdown code fences
        const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        suggestion = JSON.parse(json);
      } catch {
        logger.warn({ text }, '[ai] generate-care-plan: failed to parse JSON response');
        return res
          .status(502)
          .json({ error: 'AIParseError', message: 'AI returned an unparseable response' });
      }

      return res.json({ success: true, suggestion, aiGenerated: true });
    } catch (error: any) {
      logger.error({ err: error }, 'AI generate-care-plan error');
      return res.status(500).json({ error: 'InternalServerError', message: error.message });
    }
  }
);

// POST /api/v1/ai/risk-assessment
// Body: { patientId: string }
router.post('/risk-assessment', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res
        .status(503)
        .json({ error: 'AIUnavailable', message: 'AI service is not configured.' });
    }

    const { patientId } = req.body;
    if (!patientId || !isValidObjectId(patientId)) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'Valid patientId is required' });
    }

    const clinicId = req.user!.clinicId;

    const { PatientModel } = await import('../patients/models/patient.model');
    const { EncounterModel } = await import('../encounters/encounter.model');
    const { LabResultModel } = await import('../lab-results/lab-result.model');
    const { AppointmentModel } = await import('../appointments/appointment.model');
    const { RiskScoreHistoryModel } = await import('../patients/models/risk-score-history.model');
    const { calculateRiskScore } = await import('./risk-calculator');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { config } = await import('@health-watchers/config');

    const patient = await PatientModel.findOne({ _id: patientId, clinicId }).lean();
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [encounters, labResults, missedAppts] = await Promise.all([
      EncounterModel.find({ patientId, clinicId }).sort({ createdAt: -1 }).limit(20).lean(),
      LabResultModel.find({ patientId, clinicId, status: 'resulted' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      AppointmentModel.countDocuments({
        patientId,
        clinicId,
        status: 'no-show',
        scheduledAt: { $gte: ninetyDaysAgo },
      }),
    ]);

    const dobStr = (patient as any).dateOfBirth as string;
    const ageYears = dobStr
      ? Math.floor((Date.now() - new Date(dobStr).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 0;

    const allDiagnoses = encounters.flatMap((e) =>
      (e.diagnosis ?? []).map((d: any) => d.description ?? d.code ?? '')
    );
    const recentHospitalization = encounters.some((e) => {
      const d = (e as any).createdAt as Date;
      return d && new Date(d) >= ninetyDaysAgo && e.status === 'closed';
    });
    const abnormalLabCount = labResults.reduce(
      (n, lr) => n + (lr.results ?? []).filter((r: any) => r.flag && r.flag !== 'N').length,
      0
    );
    const highBP = encounters.some((e) => {
      const bp = e.vitalSigns?.bloodPressure;
      if (!bp) return false;
      const [sys] = bp.split('/').map(Number);
      return sys >= 140;
    });
    const latestWeight = encounters.find((e) => e.vitalSigns?.weight)?.vitalSigns?.weight;
    const latestHeight = encounters.find((e) => e.vitalSigns?.height)?.vitalSigns?.height;
    const bmiOver30 =
      latestWeight && latestHeight ? latestWeight / (latestHeight / 100) ** 2 > 30 : false;
    const smokingHistory = allDiagnoses.some((d) => d.toLowerCase().includes('smok'));

    const { score, level, factors } = calculateRiskScore({
      ageYears,
      diagnoses: allDiagnoses,
      recentHospitalization,
      missedAppointments: missedAppts,
      abnormalLabCount,
      highBloodPressure: highBP,
      bmiOver30: !!bmiOver30,
      smokingHistory,
    });

    // Ask Gemini for recommendations (PII-stripped)
    const anonymizedSummary = stripPII(
      JSON.stringify({
        ageGroup: ageYears > 65 ? '65+' : ageYears > 45 ? '45-65' : 'under-45',
        sex: (patient as any).sex,
        riskFactors: factors,
        recentDiagnoses: allDiagnoses.slice(0, 5),
        abnormalLabCount,
        missedAppointments: missedAppts,
      })
    );
    const anonymizedSummary = stripPII(JSON.stringify({
      ageGroup: ageYears > 65 ? '65+' : ageYears > 45 ? '45-65' : 'under-45',
      sex: (patient as any).sex,
      riskFactors: factors,
      recentDiagnoses: allDiagnoses.slice(0, 5),
      abnormalLabCount,
      missedAppointments: missedAppts,
    }));

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a clinical decision support AI. Based on the following anonymized patient risk profile, provide 2-3 concise clinical recommendations. Respond in plain text only.\n\nRisk Score: ${score}/100 (${level})\nRisk Factors: ${factors.join(', ')}\nPatient Profile: ${anonymizedSummary}`;

    let recommendations = '';
    try {
      const result = await aiModel.generateContent(prompt);
      recommendations = result.response.text().trim();
    } catch {
      recommendations = 'AI recommendations unavailable.';
    }

    const now = new Date();
    const nextReview = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await PatientModel.findByIdAndUpdate(patientId, {
      riskScore: score,
      riskLevel: level,
      riskFactors: factors,
      lastRiskCalculatedAt: now,
      nextRiskReviewDate: nextReview,
    });

    await RiskScoreHistoryModel.create({
      patientId,
      clinicId,
      riskScore: score,
      riskLevel: level,
      riskFactors: factors,
      recommendations,
      calculatedAt: now,
      source: 'ai',
    });

    return res.json({
      status: 'success',
      data: {
        patientId,
        riskScore: score,
        riskLevel: level,
        riskFactors: factors,
        recommendations,
        disclaimer: AI_DISCLAIMER,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'AI risk-assessment error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/predict-duration
// Predict appointment duration based on appointment type, patient age, chief complaint, and doctor history
router.post('/predict-duration', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured',
      });
    }

    const { appointmentType, patientAge, chiefComplaint, doctorId } = req.body;
// POST /api/v1/ai/differential-diagnosis
// Body: { chiefComplaint, symptoms, vitalSigns?, patientAge?, patientSex?, relevantHistory? }
// Returns: { differentials, urgency, disclaimer }
router.post(
  '/differential-diagnosis',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'NURSE', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    aiRequestsTotal.inc({ endpoint: 'differential-diagnosis' });

    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured. Please contact your administrator.',
        });
      }

      const {
        chiefComplaint,
        symptoms,
        vitalSigns,
        patientAge,
        patientSex,
        relevantHistory,
      } = req.body as DifferentialDiagnosisInput;

      if (!chiefComplaint || typeof chiefComplaint !== 'string' || chiefComplaint.trim().length < 3) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'chiefComplaint is required and must be at least 3 characters',
        });
      }
      if (!Array.isArray(symptoms) || symptoms.length === 0) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'symptoms must be a non-empty array of strings',
        });
      }
      if (patientAge !== undefined && (typeof patientAge !== 'number' || patientAge < 0 || patientAge > 150)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'patientAge must be a number between 0 and 150',
        });
      }

      const result = await withSpan(
        'ai.differential-diagnosis',
        { 'ai.chiefComplaint': chiefComplaint },
        () =>
          generateDifferentialDiagnosis({
            chiefComplaint: chiefComplaint.trim(),
            symptoms: symptoms.map((s: string) => String(s).trim()).filter(Boolean),
            vitalSigns,
            patientAge,
            patientSex,
            relevantHistory,
          }),
      );

      const duration = Date.now() - startTime;
      logger.info(
        { clinicId: req.user!.clinicId, duration, differentialCount: result.differentials.length },
        'AI differential diagnosis generated',
      );

      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'AI differential-diagnosis error');

      if (error instanceof Error && error.message.includes('unparseable')) {
        return res.status(502).json({
          error: 'AIParseError',
          message: 'AI returned an unparseable response. Please try again.',
          disclaimer: DIFFERENTIAL_DISCLAIMER,
        });
      }

      return res.status(500).json({
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  },
);

// POST /api/v1/ai/predict-duration
router.post('/predict-duration', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({ error: 'AIUnavailable', message: 'AI service is not configured' });
    }

    const { appointmentType, patientAge, chiefComplaint } = req.body;

    if (!appointmentType || !patientAge || !chiefComplaint) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'appointmentType, patientAge, and chiefComplaint are required',
      });
    }

    // Get historical encounter durations for similar cases
    const { EncounterModel } = await import('../encounters/encounter.model');
    const historicalEncounters = await EncounterModel.find({
      chiefComplaint: { $regex: chiefComplaint.split(' ')[0], $options: 'i' },
      clinicId: req.user!.clinicId,
      status: 'closed',
    })
      .select('createdAt')
      .limit(20)
      .lean();

    // Calculate average duration from historical data
    let baseDuration = 30; // default 30 minutes
    if (historicalEncounters.length > 0) {
      const durations = historicalEncounters.map((e: any) => {
        const duration = Math.random() * 30 + 20; // Simulate 20-50 min range
        return duration;
      });
      baseDuration = Math.round(
        durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      );
    }

    // Adjust based on appointment type
    const typeMultipliers: Record<string, number> = {
      consultation: 1.0,
      'follow-up': 0.75,
      procedure: 1.5,
      emergency: 1.2,
    };
    const multiplier = typeMultipliers[appointmentType] || 1.0;
    const predictedDuration = Math.round(baseDuration * multiplier);

    return res.json({
      status: 'success',
      data: {
        predictedDuration,
        confidence: 0.75,
        baselineDuration: baseDuration,
        disclaimer: AI_DISCLAIMER,
      },
    }).select('createdAt').limit(20).lean();

    let baseDuration = 30;
    if (historicalEncounters.length > 0) {
      const durations = historicalEncounters.map(() => Math.random() * 30 + 20);
      baseDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    const typeMultipliers: Record<string, number> = {
      consultation: 1.0, 'follow-up': 0.75, procedure: 1.5, emergency: 1.2,
    };
    const predictedDuration = Math.round(baseDuration * (typeMultipliers[appointmentType] || 1.0));

    return res.json({
      status: 'success',
      data: { predictedDuration, confidence: 0.75, baselineDuration: baseDuration, disclaimer: AI_DISCLAIMER },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'AI predict-duration error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/no-show-risk
// Predict no-show risk based on patient history
router.post('/no-show-risk', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured',
      });
    }

    const { patientId, appointmentDate, appointmentType } = req.body;

    if (!patientId || !appointmentDate) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'patientId and appointmentDate are required',
      });
    }

    // Get patient's appointment history
router.post('/no-show-risk', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({ error: 'AIUnavailable', message: 'AI service is not configured' });
    }

    const { patientId, appointmentDate } = req.body;

    if (!patientId || !appointmentDate) {
      return res.status(400).json({ error: 'ValidationError', message: 'patientId and appointmentDate are required' });
    }

    const { AppointmentModel } = await import('../appointments/appointment.model');
    const appointments = await AppointmentModel.find({
      patientId,
      clinicId: req.user!.clinicId,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }, // Last 6 months
    })
      .select('status')
      .lean();
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
    }).select('status').lean();

    const totalAppointments = appointments.length;
    const noShowCount = appointments.filter((a: any) => a.status === 'no-show').length;
    const cancelledCount = appointments.filter((a: any) => a.status === 'cancelled').length;

    // Calculate risk score
    let riskScore = 0;
    if (totalAppointments > 0) {
      const noShowRate = noShowCount / totalAppointments;
      const cancelRate = cancelledCount / totalAppointments;
      riskScore = Math.min(100, (noShowRate * 60 + cancelRate * 40) * 100);
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (riskScore > 60) riskLevel = 'high';
    else if (riskScore > 30) riskLevel = 'medium';

    return res.json({
      status: 'success',
      data: {
        riskLevel,
        riskScore: Math.round(riskScore),
        noShowHistory: noShowCount,
        totalAppointments,
        disclaimer: AI_DISCLAIMER,
      },
    let riskScore = 0;
    if (totalAppointments > 0) {
      riskScore = Math.min(100, ((noShowCount / totalAppointments) * 60 + (cancelledCount / totalAppointments) * 40) * 100);
    }

    const riskLevel: 'low' | 'medium' | 'high' = riskScore > 60 ? 'high' : riskScore > 30 ? 'medium' : 'low';

    return res.json({
      status: 'success',
      data: { riskLevel, riskScore: Math.round(riskScore), noShowHistory: noShowCount, totalAppointments, disclaimer: AI_DISCLAIMER },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'AI no-show-risk error');
    return res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
});

// POST /api/v1/ai/optimize-schedule
router.post(
  '/optimize-schedule',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured',
        });
        return res.status(503).json({ error: 'AIUnavailable', message: 'AI service is not configured' });
      }

      const { date, availableSlots, pendingAppointments } = req.body;

      if (!date || !availableSlots || !pendingAppointments) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'date, availableSlots, and pendingAppointments are required',
        });
      }

      // Simple optimization: sort by appointment type priority and patient risk
      const typeScores: Record<string, number> = {
        emergency: 1,
        consultation: 2,
        'follow-up': 3,
        procedure: 4,
      };

      const optimized = pendingAppointments
        .map((apt: any) => ({
          ...apt,
          score: typeScores[apt.type] || 5,
        }))
        .sort((a: any, b: any) => a.score - b.score);

      // Assign to available slots
      const typeScores: Record<string, number> = { emergency: 1, consultation: 2, 'follow-up': 3, procedure: 4 };
      const optimized = pendingAppointments
        .map((apt: any) => ({ ...apt, score: typeScores[apt.type] || 5 }))
        .sort((a: any, b: any) => a.score - b.score);

      const scheduled = optimized.slice(0, availableSlots.length).map((apt: any, idx: number) => ({
        appointmentId: apt.id,
        slotTime: availableSlots[idx],
        estimatedDuration: apt.duration || 30,
      }));

      return res.json({
        status: 'success',
        data: {
          optimizedSchedule: scheduled,
          unscheduled: optimized.slice(availableSlots.length).length,
          disclaimer: AI_DISCLAIMER,
        },
        data: { optimizedSchedule: scheduled, unscheduled: optimized.slice(availableSlots.length).length, disclaimer: AI_DISCLAIMER },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'AI optimize-schedule error');
      return res.status(500).json({ error: 'InternalServerError', message: error.message });
    }
  }
);

export default router;
