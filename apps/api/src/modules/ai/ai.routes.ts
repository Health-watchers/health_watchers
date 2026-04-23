import { Router, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { generateClinicalSummary, isAIServiceAvailable } from './ai.service';
import { authenticate } from '../../middlewares/auth.middleware';
import logger from '../../utils/logger';
import { sendAiSummaryReadyEmail } from '@api/lib/email.service';

const router = Router();

// GET /api/v1/ai/health
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai' }));

// POST /api/v1/ai/summarize
// Request body: { encounterId: string }
// Returns: { success: boolean, summary: string } or error responses
router.post('/summarize', authenticate, async (req: Request, res: Response) => {
  try {
    // Check if AI service is available
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
      });
    }

    // Validate request body
    const { encounterId } = req.body;
    if (!encounterId) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'encounterId is required',
      });
    }

    // Validate encounterId is a valid MongoDB ObjectId
    if (!isValidObjectId(encounterId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid encounterId format',
      });
    }

    // Lazy-import to avoid circular dependencies
    const { EncounterModel } = await import('../encounters/encounter.model');

    // Fetch the encounter
    const encounter = await EncounterModel.findById(encounterId);
    if (!encounter) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Encounter not found',
      });
    }

    // Generate clinical summary
    const summary = await generateClinicalSummary({
      chiefComplaint: encounter.chiefComplaint,
      notes: encounter.notes,
      diagnosis: encounter.diagnosis,
      vitalSigns: encounter.vitalSigns,
    });

    // Store the summary in the encounter
    encounter.aiSummary = summary;
    await encounter.save();

    // Notify attending doctor (non-blocking)
    try {
      const { UserModel } = await import('../auth/models/user.model');
      const { PatientModel } = await import('../patients/models/patient.model');
      const [doctor, patient] = await Promise.all([
        UserModel.findById(encounter.attendingDoctorId).lean(),
        PatientModel.findById(encounter.patientId).lean(),
      ]);
      if (doctor?.email && patient) {
        const patientName = `${(patient as any).firstName} ${(patient as any).lastName}`;
        sendAiSummaryReadyEmail(doctor.email, patientName, encounterId);
      }
    } catch { /* non-critical */ }

    return res.json({
      success: true,
      summary,
      encounterId,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'AI summarize error');

    // Handle Gemini API specific errors
    if (error.message.includes('Failed to generate AI summary')) {
      return res.status(503).json({
        error: 'AIServiceError',
        message: 'Failed to generate AI summary. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  }
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
      return res.status(400).json({ error: 'ValidationError', message: 'Valid patientId is required' });
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
      return res.status(422).json({ error: 'InsufficientData', message: 'No vital sign data available for trend analysis' });
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

export default router;
