import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose, { Schema, Document } from 'mongoose';
import { config } from '@health-watchers/config';
import { generateAnonymisedContent } from './llm-client';

export const DIFFERENTIAL_DISCLAIMER =
  'AI-generated suggestions for clinical assistance only. Not a substitute for professional medical judgment. Always verify with clinical examination and appropriate investigations.';

export interface DifferentialDiagnosisInput {
  chiefComplaint: string;
  symptoms: string[];
  vitalSigns?: {
    heartRate?: number;
    bloodPressure?: string;
    oxygenSaturation?: number;
    temperature?: number;
    respiratoryRate?: number;
  };
  patientAge?: number;
  patientSex?: string;
  relevantHistory?: string;
}

export interface DifferentialItem {
  diagnosis: string;
  icdCode: string;
  probability: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedTests: string[];
}

export interface DifferentialDiagnosisResult {
  differentials: DifferentialItem[];
  urgency: 'routine' | 'urgent' | 'emergency';
  disclaimer: string;
}

export type SuggestionAction = 'accepted' | 'rejected' | 'modified';

export interface DifferentialDiagnosisFeedback {
  encounterId: string;
  clinicianId: string;
  suggestionIcdCode: string;
  suggestionDiagnosis?: string;
  action: SuggestionAction;
  modifiedDiagnosis?: string;
  feedbackFlag: boolean;
  reason?: string;
  createdAt: Date;
}

export interface DifferentialDiagnosisFeedbackDocument
  extends DifferentialDiagnosisFeedback,
    Document {}

const differentialDiagnosisFeedbackSchema = new Schema<DifferentialDiagnosisFeedbackDocument>(
  {
    encounterId: { type: String, required: true, index: true },
    clinicianId: { type: String, required: true, index: true },
    suggestionIcdCode: { type: String, required: true },
    suggestionDiagnosis: { type: String },
    action: {
      type: String,
      required: true,
      enum: ['accepted', 'rejected', 'modified'],
    },
    modifiedDiagnosis: { type: String },
    feedbackFlag: { type: Boolean, default: false },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'differential_diagnosis_feedback' }
);

export const DifferentialDiagnosisFeedbackModel =
  (mongoose.models.DifferentialDiagnosisFeedback as mongoose.Model<DifferentialDiagnosisFeedbackDocument>) ||
  mongoose.model<DifferentialDiagnosisFeedbackDocument>(
    'DifferentialDiagnosisFeedback',
    differentialDiagnosisFeedbackSchema
  );

export interface LogSuggestionDecisionInput {
  encounterId: string;
  clinicianId: string;
  suggestionIcdCode: string;
  suggestionDiagnosis?: string;
  action: SuggestionAction;
  modifiedDiagnosis?: string;
  reason?: string;
}

export async function logSuggestionDecision(
  input: LogSuggestionDecisionInput
): Promise<DifferentialDiagnosisFeedbackDocument> {
  if (!input.encounterId) throw new Error('encounterId is required');
  if (!input.clinicianId) throw new Error('clinicianId is required');
  if (!input.suggestionIcdCode) throw new Error('suggestionIcdCode is required');
  if (!['accepted', 'rejected', 'modified'].includes(input.action)) {
    throw new Error(`Invalid action: ${input.action}`);
  }
  if (input.action === 'modified' && !input.modifiedDiagnosis) {
    throw new Error('modifiedDiagnosis is required when action is "modified"');
  }

  return DifferentialDiagnosisFeedbackModel.create({
    encounterId: input.encounterId,
    clinicianId: input.clinicianId,
    suggestionIcdCode: input.suggestionIcdCode,
    suggestionDiagnosis: input.suggestionDiagnosis,
    action: input.action,
    modifiedDiagnosis: input.modifiedDiagnosis,
    feedbackFlag: false,
    reason: input.reason,
    createdAt: new Date(),
  });
}

export interface FlagIncorrectSuggestionInput {
  encounterId: string;
  clinicianId: string;
  suggestionIcdCode: string;
  suggestionDiagnosis?: string;
  reason?: string;
}

export async function flagIncorrectSuggestion(
  input: FlagIncorrectSuggestionInput
): Promise<DifferentialDiagnosisFeedbackDocument> {
  if (!input.encounterId) throw new Error('encounterId is required');
  if (!input.clinicianId) throw new Error('clinicianId is required');
  if (!input.suggestionIcdCode) throw new Error('suggestionIcdCode is required');

  return DifferentialDiagnosisFeedbackModel.create({
    encounterId: input.encounterId,
    clinicianId: input.clinicianId,
    suggestionIcdCode: input.suggestionIcdCode,
    suggestionDiagnosis: input.suggestionDiagnosis,
    action: 'rejected',
    feedbackFlag: true,
    reason: input.reason,
    createdAt: new Date(),
  });
}

export async function generateDifferentialDiagnosis(
  input: DifferentialDiagnosisInput,
  context: DifferentialDiagnosisContext
): Promise<DifferentialDiagnosisResult> {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  // Clinical context is anonymised centrally by the shared LLM client
  // (@health-watchers/anonymize) before it leaves the process.
  const clinicalContext = [
    `Chief Complaint: ${input.chiefComplaint}`,
    `Symptoms: ${input.symptoms.join(', ')}`,
    input.vitalSigns ? `Vital Signs: ${JSON.stringify(input.vitalSigns)}` : '',
    input.patientAge ? `Patient Age: ${input.patientAge} years` : '',
    input.patientSex ? `Patient Sex: ${input.patientSex}` : '',
    input.relevantHistory ? `Relevant History: ${input.relevantHistory}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a clinical decision support AI assisting a physician. Based on the anonymised patient presentation below, generate a differential diagnosis list.

PATIENT PRESENTATION:
${clinicalContext}

Respond ONLY with a valid JSON object matching this exact structure (no markdown, no explanation outside JSON):
{
  "differentials": [
    {
      "diagnosis": "string — diagnosis name",
      "icdCode": "string — ICD-10 code (e.g. I24.9)",
      "probability": "high" | "medium" | "low",
      "reasoning": "string — 1-2 sentence clinical reasoning referencing the presented findings",
      "recommendedTests": ["string", ...]
    }
  ],
  "urgency": "routine" | "urgent" | "emergency"
}

Rules:
- Provide 3 to 5 differentials ordered from most to least likely.
- Each diagnosis must include a valid ICD-10 code.
- Urgency: "emergency" if life-threatening presentation, "urgent" if requires same-day evaluation, "routine" otherwise.
- Do NOT include any patient-identifying information in the response.
- Do NOT include markdown code fences or any text outside the JSON object.`;

  const raw = (
    await generateAnonymisedContent(prompt, {
      clinicId: context.clinicId,
      userId: context.userId,
      patientId: context.patientId,
      feature: 'differential-diagnosis',
    })
  ).trim();

  // Strip possible markdown fences
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Omit<DifferentialDiagnosisResult, 'disclaimer'>;
  try {
    parsed = await generateJson<Omit<DifferentialDiagnosisResult, 'disclaimer'>>(prompt);
  } catch (err) {
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError('AI returned an unparseable response', err);
  }

  // Validate shape
  if (!Array.isArray(parsed.differentials) || parsed.differentials.length === 0) {
    throw new Error('AI response missing differentials array');
  }
  if (!['routine', 'urgent', 'emergency'].includes(parsed.urgency)) {
    parsed.urgency = 'routine';
  }

  return {
    differentials: parsed.differentials,
    urgency: parsed.urgency,
    disclaimer: DIFFERENTIAL_DISCLAIMER,
  };
}
