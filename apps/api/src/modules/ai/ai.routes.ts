import { Router, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  generateClinicalSummary,
  generateRawTextSummary,
  generatePatientInsights,
  generatePatientHealthSummary,
  generateDifferentialDiagnosis,
  isAIServiceAvailable,
  AI_DISCLAIMER,
  calculateDosage,
  suggestClinicalCodes,
  checkDrugInteractions,
} from './ai.service';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import logger from '../../utils/logger';
import { sendAISummaryNotification } from '@api/lib/email.service';
import { cache } from '../../services/cache.service';
import {
  differentialDiagnosisRequestSchema,
  DifferentialDiagnosisRequestDto,
  dosageCalculatorRequestSchema,
  DosageCalculatorRequestDto,
  drugInteractionRequestSchema,
  DrugInteractionRequestDto,
  triageAssessmentSchema,
} from './ai.validation';
import { assessTriage, addToTriageQueue, getTriageQueue, updateTriageStatus } from './triage.service';

const router = Router();

// Mount population health routes
router.use('/', populationHealthRoutes);

// GET /api/v1/ai/health
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai' }));

// POST /api/v1/ai/summarize
// Request body: { encounterId?: string, text?: string }
// Returns: { success: boolean, summary: string, disclaimer: string }
router.post('/summarize', authenticate, async (req: Request, res: Response) => {
  const startTime = Date.now();
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
      summary = await generateRawTextSummary(text);
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

      summary = await generateClinicalSummary({
        chiefComplaint: encounter.chiefComplaint,
        notes: encounter.notes,
        diagnosis: encounter.diagnosis,
        vitalSigns: encounter.vitalSigns,
      });

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
          sendAISummaryNotification(doctor.email, patientName, encounterId, doctor?.preferences?.language);
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

// POST /api/v1/ai/patient-summary/:patientId
// Returns: { success: boolean, summary: { overview, activeConditions, currentMedications, recentLabResults, upcomingAppointments, riskFactors } }
router.post(
  '/patient-summary/:patientId',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE'),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured. Please contact your administrator.',
        });
      }

      const { patientId } = req.params;
      if (!isValidObjectId(patientId)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Valid patientId is required',
        });
      }

      const clinicId = String(req.user!.clinicId);
      const cacheKey = `ai:patient-summary:${clinicId}:${patientId}`;
      const cached = await cache.get<{ summary: unknown; generatedAt: string }>(cacheKey);
      if (cached) {
        return res.json({ success: true, cached: true, patientId, ...cached });
      }

      const { EncounterModel } = await import('../encounters/encounter.model');
      const { LabResultModel } = await import('../lab-results/lab-result.model');
      const { AppointmentModel } = await import('../appointments/appointment.model');
      const { MedicalHistoryModel } = await import('../patients/models/medical-history.model');
      const { PatientModel } = await import('../patients/models/patient.model');

      const [patient, recentEncounters, labResults, appointments, medicalHistory] = await Promise.all([
        PatientModel.findOne({ _id: patientId, clinicId: req.user!.clinicId, isActive: true }).lean(),
        EncounterModel.find({ patientId, clinicId: req.user!.clinicId, isActive: true })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('chiefComplaint diagnosis notes createdAt')
          .lean(),
        LabResultModel.find({ patientId, clinicId: req.user!.clinicId, status: 'resulted' })
          .sort({ resultedAt: -1, orderedAt: -1 })
          .limit(5)
          .select('testName testCode results orderedAt resultedAt')
          .lean(),
        AppointmentModel.find({ patientId, clinicId: req.user!.clinicId })
          .sort({ scheduledAt: 1 })
          .limit(5)
          .select('scheduledAt type status doctorId')
          .lean(),
        MedicalHistoryModel.findOne({ patientId, clinicId: req.user!.clinicId }).lean(),
      ]);

      if (!patient) {
        return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
      }

      const summary = await generatePatientHealthSummary({
        age: typeof (patient as any).age === 'number' ? (patient as any).age : null,
        sex: (patient as any).sex ?? null,
        allergies: (patient as any).allergies?.filter((allergy: any) => allergy.isActive !== false).map((allergy: any) => ({
          allergen: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
        })) ?? [],
        currentMedications: medicalHistory?.currentMedications?.map((medication) => ({
          name: medication.name,
          dose: medication.dose,
          frequency: medication.frequency,
        })) ?? [],
        recentLabResults: labResults.map((lab) => ({
          testName: lab.testName,
          orderedAt: lab.resultedAt ?? lab.orderedAt,
          results: (lab.results ?? []).map((result) => ({
            parameter: result.parameter,
            value: result.value,
            unit: result.unit,
            flag: result.flag,
          })),
        })),
        upcomingAppointments: appointments.map((appointment) => ({
          scheduledAt: appointment.scheduledAt,
          type: appointment.type,
          status: appointment.status,
          clinician: String(appointment.doctorId),
        })),
        recentEncounters: recentEncounters.map((encounter) => ({
          chiefComplaint: encounter.chiefComplaint,
          diagnosis: encounter.diagnosis,
          notes: encounter.notes,
          createdAt: encounter.createdAt,
        })),
        riskFactors: Array.from(
          new Set([
            ...(patient as any).riskFactors ?? [],
            ...(patient as any).allergies?.map((allergy: any) => `Allergy: ${allergy.allergen}`) ?? [],
            medicalHistory?.socialHistory?.smokingStatus ? `Smoking status: ${medicalHistory.socialHistory.smokingStatus}` : null,
            medicalHistory?.socialHistory?.alcoholUse ? `Alcohol use: ${medicalHistory.socialHistory.alcoholUse}` : null,
            medicalHistory?.socialHistory?.exerciseFrequency ? `Exercise frequency: ${medicalHistory.socialHistory.exerciseFrequency}` : null,
          ].filter(Boolean) as string[])
        ),
      });

      const generatedAt = new Date().toISOString();
      const response = { summary, generatedAt };
      await Promise.all([
        cache.set(cacheKey, response, 60 * 60),
        PatientModel.findByIdAndUpdate(patientId, { lastSummaryGeneratedAt: new Date() }),
      ]);

      logger.info({ patientId, duration: Date.now() - startTime }, 'Patient summary generated');
      return res.json({ success: true, patientId, ...response });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'AI patient-summary error');
      if (error instanceof Error && error.message.includes('Failed to generate patient health summary')) {
        return res.status(503).json({
          error: 'AIServiceError',
          message: 'Failed to generate patient summary. Please try again later.',
        });
      }
      return res.status(500).json({
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
);

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
      })),
    );

    const duration = Date.now() - startTime;
    logger.info({ patientId, encounterCount: encounters.length, duration }, 'AI insights generated');

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
// Request body: { medications: string[] }
// Returns: DrugInteractionResult (always — safe fallback on failure)
router.post(
  '/drug-interactions',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE'),
  validateRequest({ body: drugInteractionRequestSchema }),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured. Please contact your administrator.',
        });
      }

      const { medications } = req.body as DrugInteractionRequestDto;
      const result = await checkDrugInteractions(medications);

      const duration = Date.now() - startTime;
      logger.info({ medicationCount: medications.length, severity: result.severity, duration }, 'Drug interaction check completed');

      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'Drug interaction check error');
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'An unexpected error occurred while checking drug interactions.',
      });
    }
  }
);

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
      return res.status(400).json({ error: 'ValidationError', message: 'Valid labResultId is required' });
    }

    const { LabResultModel } = await import('../lab-results/lab-result.model');
    const labResult = await LabResultModel.findById(labResultId);
    if (!labResult) {
      return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    }
    if (!labResult.results || labResult.results.length === 0) {
      return res.status(422).json({ error: 'NoResults', message: 'Lab result has no result entries to interpret' });
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

// POST /api/v1/ai/differential-diagnosis
// Request: { chiefComplaint: string, symptoms: string[], vitalSigns?: {...}, patientAge?: number, patientSex?: string, relevantHistory?: string }
// Returns: { differentials: [...], urgency: string, disclaimer: string }
router.post(
  '/differential-diagnosis',
  authenticate,
  validateRequest({ body: differentialDiagnosisRequestSchema }),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured. Please contact your administrator.',
        });
      }
      const payload = req.body as DifferentialDiagnosisRequestDto;

      const result = await generateDifferentialDiagnosis(payload);

      const duration = Date.now() - startTime;
      logger.info(
        { duration, symptomsCount: payload.symptoms.length, hasVitalSigns: Boolean(payload.vitalSigns) },
        'Differential diagnosis generated'
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'AI differential-diagnosis error');

      if (error instanceof Error && error.message.includes('Failed to generate differential diagnosis')) {
        return res.status(503).json({
          error: 'AIServiceError',
          message: 'Failed to generate AI suggestions. Please try again later.',
        });
      }

      return res.status(500).json({
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
);

// POST /api/v1/ai/dosage-calculator
// Request: { drugName, patientWeight, patientAge, patientSex, indication, renalFunction?, hepaticFunction? }
// Returns: { recommendedDose, frequency, route, maxDailyDose, pediatricAdjustment, renalAdjustment, warnings, contraindications, disclaimer }
router.post(
  '/dosage-calculator',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: dosageCalculatorRequestSchema }),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!isAIServiceAvailable()) {
        return res.status(503).json({
          error: 'AIUnavailable',
          message: 'AI service is not configured. Please contact your administrator.',
        });
      }

      const payload = req.body as DosageCalculatorRequestDto;
      const result = await calculateDosage(payload);

      const duration = Date.now() - startTime;
      logger.info(
        { drug: payload.drugName, age: payload.patientAge, weight: payload.patientWeight, duration },
        'Dosage calculation completed'
      );

      // Audit log — non-blocking
      import('../audit/audit.service').then(({ auditLog }) =>
        auditLog(
          {
            action: 'DOSAGE_CALCULATION',
            userId: req.user!.userId,
            clinicId: req.user!.clinicId,
            resourceType: 'drug',
            metadata: {
              drugName: payload.drugName,
              patientAge: payload.patientAge,
              patientWeight: payload.patientWeight,
              pediatricAdjustment: result.pediatricAdjustment,
              renalAdjustment: result.renalAdjustment,
              warningCount: result.warnings.length,
              contraindicationCount: result.contraindications.length,
            },
          },
          req
        )
      ).catch(() => { /* non-critical */ });

      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, 'AI dosage-calculator error');

      if (error instanceof Error && error.message.includes('Failed to calculate dosage')) {
        return res.status(503).json({
          error: 'AIServiceError',
          message: 'Failed to calculate dosage. Please try again later.',
        });
      }

      return res.status(500).json({
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
);

// POST /api/v1/ai/triage
router.post('/triage', authenticate, validateRequest(triageAssessmentSchema), async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured.',
      });
    }

    const triageResult = await assessTriage(req.body);
    const queueEntry = await addToTriageQueue(
      req.user!.clinicId,
      req.body.patientId,
      req.body,
      triageResult
    );

    return res.json({ success: true, ...triageResult, queueId: queueEntry._id });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Triage assessment error');
    return res.status(500).json({
      error: 'TriageError',
      message: error instanceof Error ? error.message : 'Failed to assess triage',
    });
  }
});

// GET /api/v1/ai/triage/queue
router.get('/triage/queue', authenticate, requireRoles(['CLINIC_ADMIN', 'NURSE']), async (req: Request, res: Response) => {
  try {
    const queue = await getTriageQueue(req.user!.clinicId);
    return res.json({ success: true, queue });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Triage queue fetch error');
    return res.status(500).json({ error: 'InternalServerError' });
  }
});

// PUT /api/v1/ai/triage/:id/status
router.put('/triage/:id/status', authenticate, requireRoles(['CLINIC_ADMIN', 'NURSE']), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['pending', 'seen', 'discharged'].includes(status)) {
      return res.status(400).json({ error: 'InvalidStatus' });
    }

    const updated = await updateTriageStatus(req.params.id, status);
    return res.json({ success: true, data: updated });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Triage status update error');
    return res.status(500).json({ error: 'InternalServerError' });
  }
});

// POST /api/v1/ai/transcribe
router.post('/transcribe', authenticate, requireRoles('DOCTOR', 'NURSE'), async (req: Request, res: Response) => {
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured. Please contact your administrator.',
      });
    }

    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'text field is required and must be a non-empty string',
      });
    }

    const { transcribeAndCorrect } = await import('./ai.service');
    const result = await transcribeAndCorrect(text);

    return res.json({
      status: 'success',
      data: result,
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Transcription error');
    if (error instanceof Error && error.message.includes('GEMINI')) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is temporarily unavailable',
      });
    }
    return res.status(500).json({ error: 'InternalServerError' });
  }
});

export default router;
