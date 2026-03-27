import { Router, Request, Response } from 'express';
import { Schema } from 'mongoose';
import { generateClinicalSummary, isAIServiceAvailable } from './ai.service';

const router = Router();

// GET /api/v1/ai/health
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai' }));

// POST /api/v1/ai/summarize
// Request body: { encounterId: string }
// Returns: { success: boolean, summary: string } or error responses
router.post('/summarize', async (req: Request, res: Response) => {
  try {
    // Check if AI service is available
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIServiceUnavailable',
        message: 'AI service is not configured. Please set GEMINI_API_KEY environment variable.',
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
    if (!Schema.Types.ObjectId.isValid(encounterId)) {
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
      treatmentPlan: encounter.treatmentPlan,
    });

    // Store the summary in the encounter
    encounter.aiSummary = summary;
    await encounter.save();

    return res.json({
      success: true,
      summary,
      encounterId,
    });
  } catch (error: any) {
    console.error('AI summarize error:', error);

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

export default router;
