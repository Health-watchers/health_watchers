import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@health-watchers/config';

let clientInstance: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');
  if (!clientInstance) clientInstance = new GoogleGenerativeAI(config.geminiApiKey);
  return clientInstance;
}

export function isAIServiceAvailable(): boolean {
  return !!config.geminiApiKey;
}

export const AI_DISCLAIMER =
  'AI-generated summary for clinical assistance only. Not a substitute for professional medical judgment.';

// ── PII stripping ─────────────────────────────────────────────────────────────
// Remove common PII patterns before sending to external AI API
const PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],                          // phone numbers
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]'],                 // email addresses
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],                                         // SSN
  [/\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-]\d{2,4}\b/g, '[DOB]'], // dates of birth
  [/\b\d{5}(-\d{4})?\b/g, '[ZIP]'],                                             // zip codes
];

export function stripPII(text: string): string {
  let sanitized = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

// ── Clinical summary ──────────────────────────────────────────────────────────
export interface ClinicalNotesInput {
  chiefComplaint: string;
  notes?: string;
  diagnosis?: unknown;
  vitalSigns?: unknown;
}

export async function generateClinicalSummary(clinicalNotes: ClinicalNotesInput): Promise<string> {
  const client = getGeminiClient();

  const rawText = [
    `Chief Complaint: ${clinicalNotes.chiefComplaint}`,
    clinicalNotes.notes ? `Clinical Notes: ${clinicalNotes.notes}` : '',
    clinicalNotes.diagnosis ? `Diagnosis: ${JSON.stringify(clinicalNotes.diagnosis)}` : '',
    clinicalNotes.vitalSigns ? `Vital Signs: ${JSON.stringify(clinicalNotes.vitalSigns)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeText = stripPII(rawText);

  const prompt = `Summarize the following clinical encounter in 2-3 sentences for a medical professional. Include chief complaint, key findings, and recommended follow-up:\n\n${safeText}`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate AI summary: ${msg}`);
  }
}

export async function generateRawTextSummary(text: string): Promise<string> {
  const client = getGeminiClient();
  const safeText = stripPII(text);
  const prompt = `Summarize the following clinical notes in 2-3 sentences for a medical professional. Include chief complaint, key findings, and recommended follow-up:\n\n${safeText}`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate AI summary: ${msg}`);
  }
}

// ── Longitudinal insights ─────────────────────────────────────────────────────
export interface EncounterSummary {
  chiefComplaint: string;
  notes?: string;
  diagnosis?: unknown;
  createdAt: Date | string;
}

export async function generatePatientInsights(encounters: EncounterSummary[]): Promise<string> {
  const client = getGeminiClient();

  const encounterText = encounters
    .map((e, i) => {
      const date = new Date(e.createdAt).toLocaleDateString();
      const lines = [
        `Encounter ${i + 1} (${date}): ${e.chiefComplaint}`,
        e.notes ? `  Notes: ${e.notes}` : '',
        e.diagnosis ? `  Diagnosis: ${JSON.stringify(e.diagnosis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return stripPII(lines);
    })
    .join('\n\n');

  const prompt = `You are a medical AI assistant. Based on the following ${encounters.length} clinical encounters for a single patient, provide a longitudinal health trend summary in 3-5 sentences. Identify recurring conditions, patterns, or areas of concern:\n\n${encounterText}`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate patient insights: ${msg}`);
  }
}

// ── Differential Diagnosis ───────────────────────────────────────────────────
export interface DifferentialDiagnosisInput {
  chiefComplaint: string;
  symptoms: string[];
  vitalSigns?: {
    heartRate?: number;
    bloodPressure?: string;
    oxygenSaturation?: number;
    temperature?: number;
  };
  patientAge?: number;
  patientSex?: string;
  relevantHistory?: string;
}

export interface DifferentialSuggestion {
  diagnosis: string;
  icdCode: string;
  probability: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedTests: string[];
}

export interface DifferentialDiagnosisResponse {
  differentials: DifferentialSuggestion[];
  urgency: 'routine' | 'urgent' | 'emergency';
  disclaimer: string;
}

export async function generateDifferentialDiagnosis(
  input: DifferentialDiagnosisInput
): Promise<DifferentialDiagnosisResponse> {
  const client = getGeminiClient();

  const context = [
    `Chief Complaint: ${input.chiefComplaint}`,
    `Symptoms: ${input.symptoms.join(', ')}`,
    input.vitalSigns ? `Vital Signs: ${JSON.stringify(input.vitalSigns)}` : '',
    input.patientAge ? `Patient Age: ${input.patientAge}` : '',
    input.patientSex ? `Patient Sex: ${input.patientSex}` : '',
    input.relevantHistory ? `Relevant History: ${input.relevantHistory}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeContext = stripPII(context);

  const prompt = `You are a clinical decision support AI. Based on the following patient presentation, suggest the top 3-5 differential diagnoses.

Patient Presentation:
${safeContext}

Respond ONLY with a valid JSON object matching this exact structure (no markdown, no explanation):
{
  "differentials": [
    {
      "diagnosis": "string",
      "icdCode": "string (ICD-10 format)",
      "probability": "high" | "medium" | "low",
      "reasoning": "string (1-2 sentences explain why based on the presentation)",
      "recommendedTests": ["string", "string"]
    }
  ],
  "urgency": "routine" | "urgent" | "emergency"
}

Ensure the diagnosis are clinically plausible and the reasoning is sound. If data is sparse, provide the most likely possibilities.`;

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // The model might still return markdown code fences even with responseMimeType
    const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const data = JSON.parse(jsonStr);

    return {
      ...data,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate differential diagnosis: ${msg}`);
  }
}
