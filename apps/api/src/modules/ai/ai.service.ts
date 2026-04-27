import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@health-watchers/config';
import { z } from 'zod';

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

const differentialSuggestionSchema = z.object({
  diagnosis: z.string().trim().min(1),
  icdCode: z.string().trim().min(1),
  probability: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().trim().min(1),
  recommendedTests: z.array(z.string().trim().min(1)).min(1),
});

const differentialDiagnosisResponseSchema = z.object({
  differentials: z.array(differentialSuggestionSchema).min(1).max(5),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
});

function buildDifferentialDiagnosisPrompt(input: DifferentialDiagnosisInput): string {
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

  return `You are a clinical decision support AI assisting a licensed clinician with differential diagnosis triage.
Use only the de-identified clinical context below. Do not infer or generate any patient identifiers.

Patient Presentation:
${safeContext}

Return ONLY valid JSON (no markdown, no comments, no explanation) with this exact schema:
{
  "differentials": [
    {
      "diagnosis": "string",
      "icdCode": "string",
      "probability": "high" | "medium" | "low",
      "reasoning": "string",
      "recommendedTests": ["string"]
    }
  ],
  "urgency": "routine" | "urgent" | "emergency"
}

Rules:
1) Provide 3-5 clinically plausible differentials ordered by likelihood.
2) Base reasoning only on provided findings (chief complaint, symptoms, vitals, age/sex/history).
3) recommendedTests must list practical confirmatory or rule-out tests.
4) Use "emergency" urgency when immediate life-threatening diagnoses are plausible.`;
}

export async function generateDifferentialDiagnosis(
  input: DifferentialDiagnosisInput
): Promise<DifferentialDiagnosisResponse> {
  const client = getGeminiClient();
  const prompt = buildDifferentialDiagnosisPrompt(input);

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // The model might still return markdown code fences even with responseMimeType
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);
    const validated = differentialDiagnosisResponseSchema.parse(parsed);

    return {
      ...validated,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate differential diagnosis: ${msg}`);
  }
}

// ── Dosage Calculator ─────────────────────────────────────────────────────────

export interface DosageCalculatorInput {
  drugName: string;
  patientWeight: number;
  patientAge: number;
  patientSex: 'M' | 'F';
  indication: string;
  renalFunction?: 'normal' | 'mild_impairment' | 'moderate_impairment' | 'severe_impairment';
  hepaticFunction?: 'normal' | 'impaired';
}

export interface DosageCalculatorResponse {
  recommendedDose: string;
  frequency: string;
  route: string;
  maxDailyDose: string;
  pediatricAdjustment: boolean;
  renalAdjustment: boolean;
  warnings: string[];
  contraindications: string[];
  disclaimer: string;
}

const dosageResponseSchema = z.object({
  recommendedDose: z.string().trim().min(1),
  frequency: z.string().trim().min(1),
  route: z.string().trim().min(1),
  maxDailyDose: z.string().trim().min(1),
  pediatricAdjustment: z.boolean(),
  renalAdjustment: z.boolean(),
  warnings: z.array(z.string()),
  contraindications: z.array(z.string()),
});

export async function calculateDosage(input: DosageCalculatorInput): Promise<DosageCalculatorResponse> {
  const client = getGeminiClient();

  const context = [
    `Drug: ${input.drugName}`,
    `Indication: ${input.indication}`,
    `Patient weight: ${input.patientWeight} kg`,
    `Patient age: ${input.patientAge} years`,
    `Patient sex: ${input.patientSex === 'M' ? 'Male' : 'Female'}`,
    input.renalFunction ? `Renal function: ${input.renalFunction.replace(/_/g, ' ')}` : '',
    input.hepaticFunction ? `Hepatic function: ${input.hepaticFunction.replace(/_/g, ' ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a clinical pharmacology AI assisting a licensed clinician. Calculate the appropriate dosage for the following de-identified patient parameters using evidence-based guidelines.

Patient Parameters:
${context}

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "recommendedDose": "string (e.g. '500 mg' or '10 mg/kg')",
  "frequency": "string (e.g. 'every 8 hours' or 'once daily')",
  "route": "string (e.g. 'oral', 'intravenous', 'intramuscular')",
  "maxDailyDose": "string (e.g. '3000 mg/day')",
  "pediatricAdjustment": boolean (true if age < 18 or weight-based dosing applied),
  "renalAdjustment": boolean (true if renal impairment dose adjustment applied),
  "warnings": ["string"] (list of clinical warnings; empty array if none),
  "contraindications": ["string"] (list of contraindications; empty array if none)
}

Rules:
1. Use weight-based dosing (mg/kg) for patients under 18 years.
2. Adjust dose for renal/hepatic impairment per standard guidelines.
3. Flag any dose that exceeds the maximum recommended daily dose in warnings.
4. List absolute contraindications separately from warnings.
5. If the drug is contraindicated for this patient, still return the structure but include the contraindication.`;

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);
    const validated = dosageResponseSchema.parse(parsed);

    return {
      ...validated,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to calculate dosage: ${msg}`);
  }
}
