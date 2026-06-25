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

export interface PatientFriendlySummaryInput {
  chiefComplaint: string;
  soapNotes?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  diagnosis?: Array<{ code: string; description: string }>;
  vitalSigns?: Record<string, unknown>;
  prescriptions?: Array<{ drugName: string; dosage: string; frequency: string; duration: string }>;
}

export async function generatePatientFriendlySummary(input: PatientFriendlySummaryInput): Promise<string> {
  const client = getGeminiClient();

  const parts: string[] = [`Chief Complaint: ${input.chiefComplaint}`];
  if (input.soapNotes?.assessment) parts.push(`Assessment: ${input.soapNotes.assessment}`);
  if (input.soapNotes?.plan) parts.push(`Plan: ${input.soapNotes.plan}`);
  if (input.diagnosis?.length) {
    parts.push(`Diagnosis: ${input.diagnosis.map((d) => d.description).join(', ')}`);
  }
  if (input.prescriptions?.length) {
    parts.push(`Medications: ${input.prescriptions.map((p) => `${p.drugName} ${p.dosage} ${p.frequency} for ${p.duration}`).join('; ')}`);
  }

  const safeText = stripPII(parts.join('\n'));

  const prompt = `You are a patient-friendly health assistant. Summarize the following clinical encounter in plain, easy-to-understand language (no medical jargon) in 2-4 sentences. Focus on: what the visit was about, what was found, and what the patient should do next. Do not include any personally identifiable information.\n\n${safeText}`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate patient-friendly summary: ${msg}`);
  }
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

export interface PatientSummaryEncounterInput {
  chiefComplaint?: string;
  diagnosis?: unknown;
  notes?: string;
  createdAt: Date | string;
}

export interface PatientHealthSummaryInput {
  age?: number | null;
  sex?: string | null;
  allergies: Array<{ allergen: string; severity: string; reaction?: string }>;
  currentMedications: Array<{ name: string; dose?: string; frequency?: string }>;
  recentLabResults: Array<{
    testName: string;
    orderedAt: Date | string;
    results?: Array<{ parameter: string; value: string; unit?: string; flag?: string }>;
  }>;
  upcomingAppointments: Array<{
    scheduledAt: Date | string;
    type: string;
    status: string;
    clinician?: string;
  }>;
  recentEncounters: PatientSummaryEncounterInput[];
  riskFactors: string[];
}

const patientHealthSummarySchema = z.object({
  overview: z.string().trim().min(1),
  activeConditions: z.array(z.string().trim().min(1)),
  currentMedications: z.array(z.string().trim().min(1)),
  recentLabResults: z.array(z.string().trim().min(1)),
  upcomingAppointments: z.array(z.string().trim().min(1)),
  riskFactors: z.array(z.string().trim().min(1)),
});

export interface PatientHealthSummary {
  overview: string;
  activeConditions: string[];
  currentMedications: string[];
  recentLabResults: string[];
  upcomingAppointments: string[];
  riskFactors: string[];
}

export async function generatePatientHealthSummary(input: PatientHealthSummaryInput): Promise<PatientHealthSummary> {
  const client = getGeminiClient();

  const promptPayload = {
    demographics: {
      age: input.age ?? null,
      sex: input.sex ?? null,
    },
    allergies: input.allergies,
    currentMedications: input.currentMedications,
    recentLabResults: input.recentLabResults.map((lab) => ({
      testName: lab.testName,
      orderedAt: new Date(lab.orderedAt).toISOString(),
      results: lab.results?.map((result) => ({
        parameter: result.parameter,
        value: result.value,
        unit: result.unit,
        flag: result.flag,
      })),
    })),
    upcomingAppointments: input.upcomingAppointments.map((appointment) => ({
      scheduledAt: new Date(appointment.scheduledAt).toISOString(),
      type: appointment.type,
      status: appointment.status,
      clinician: appointment.clinician,
    })),
    recentEncounters: input.recentEncounters.map((encounter) => ({
      createdAt: new Date(encounter.createdAt).toISOString(),
      chiefComplaint: encounter.chiefComplaint,
      diagnosis: encounter.diagnosis,
      notes: encounter.notes,
    })),
    riskFactors: input.riskFactors,
  };

  const safeText = stripPII(JSON.stringify(promptPayload, null, 2));

  const prompt = `You are a medical AI assistant. Generate a one-page clinical patient summary for a clinician using only the de-identified data below.

Return ONLY valid JSON with this exact structure:
{
  "overview": "string",
  "activeConditions": ["string"],
  "currentMedications": ["string"],
  "recentLabResults": ["string"],
  "upcomingAppointments": ["string"],
  "riskFactors": ["string"]
}

Sections must be concise and clinically useful. Do not include any direct identifiers or speculate beyond the supplied data.

Patient context:
${safeText}`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);
    return patientHealthSummarySchema.parse(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate patient health summary: ${msg}`);
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

// ── Drug Interactions ─────────────────────────────────────────────────────────

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'none' | 'minor' | 'moderate' | 'major' | 'contraindicated';
  description: string;
  recommendation: string;
}

export interface DrugInteractionResult {
  interactions: DrugInteraction[];
  severity: 'none' | 'minor' | 'moderate' | 'major' | 'contraindicated';
  summary: string;
  disclaimer: string;
}

export const DRUG_INTERACTION_FALLBACK: DrugInteractionResult = {
  interactions: [],
  severity: 'none',
  summary: 'Drug interaction analysis could not be completed. Please consult a clinical pharmacist.',
  disclaimer:
    'AI drug interaction check is unavailable. This result should NOT be used for clinical decisions. Consult a pharmacist or clinical decision support tool.',
};

export function extractJSON(text: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find first { ... } block in case of extra explanation text
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1).trim();
  }

  return text.trim();
}

const drugInteractionSchema = z.object({
  drug1: z.string().trim().min(1),
  drug2: z.string().trim().min(1),
  severity: z.enum(['none', 'minor', 'moderate', 'major', 'contraindicated']),
  description: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
});

const drugInteractionResultSchema = z.object({
  interactions: z.array(drugInteractionSchema),
  severity: z.enum(['none', 'minor', 'moderate', 'major', 'contraindicated']),
  summary: z.string().trim().min(1),
});

function buildDrugInteractionPrompt(medications: string[], strict: boolean): string {
  const strictNote = strict
    ? '\nCRITICAL: Return ONLY the raw JSON object. No markdown, no code fences, no text before or after the JSON.'
    : '';
  return `You are a clinical pharmacology AI. Analyze drug interactions for the following medications: ${medications.join(', ')}.

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "interactions": [
    {
      "drug1": "string",
      "drug2": "string",
      "severity": "none" | "minor" | "moderate" | "major" | "contraindicated",
      "description": "string",
      "recommendation": "string"
    }
  ],
  "severity": "none" | "minor" | "moderate" | "major" | "contraindicated",
  "summary": "string"
}

Rules:
1. List every pairwise interaction between the provided medications.
2. "severity" at the top level is the highest severity found across all interactions.
3. If no interactions exist, return an empty interactions array with severity "none".
4. Base recommendations on established clinical guidelines.${strictNote}`;
}

export async function checkDrugInteractions(medications: string[]): Promise<DrugInteractionResult> {
  const client = getGeminiClient();

  const model = client.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildDrugInteractionPrompt(medications, attempt > 0);
    let rawText = '';
    try {
      const result = await model.generateContent(prompt);
      rawText = result.response.text().trim();

      // Log raw output at debug level only — never expose to client
      const { default: logger } = await import('../../utils/logger');
      logger.debug({ attempt, rawText }, '[ai] drug interaction raw LLM response');

      const jsonStr = extractJSON(rawText);
      const parsed = JSON.parse(jsonStr);
      const validated = drugInteractionResultSchema.parse(parsed);

      return {
        ...validated,
        disclaimer: AI_DISCLAIMER,
      };
    } catch (err) {
      const { default: logger } = await import('../../utils/logger');
      logger.debug({ attempt, err: err instanceof Error ? err.message : err }, '[ai] drug interaction parse failed');
      if (attempt === 1) break;
    }
  }

  return DRUG_INTERACTION_FALLBACK;
}

// ── Clinical Coding (ICD-10 & CPT) ────────────────────────────────────────────

export interface CodeSuggestion {
  code: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface ClinicalCodingResponse {
  diagnosisCodes: CodeSuggestion[];
  procedureCodes: CodeSuggestion[];
  disclaimer: string;
}

const codeSuggestionSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().trim().min(1),
});

const clinicalCodingResponseSchema = z.object({
  diagnosisCodes: z.array(codeSuggestionSchema).min(1).max(10),
  procedureCodes: z.array(codeSuggestionSchema).min(0).max(10),
});

export async function suggestClinicalCodes(input: {
  chiefComplaint: string;
  clinicalNotes: string;
  procedures?: string[];
}): Promise<ClinicalCodingResponse> {
  const client = getGeminiClient();

  const safeNotes = stripPII(input.clinicalNotes);
  const procedureList = input.procedures?.length ? input.procedures.join(', ') : 'None documented';

  const prompt = `You are a medical coding AI assisting a licensed coder with ICD-10 diagnosis and CPT procedure code suggestions.
Use only the de-identified clinical context below. Do not infer or generate any patient identifiers.

Clinical Presentation:
Chief Complaint: ${input.chiefComplaint}
Clinical Notes: ${safeNotes}
Procedures Performed: ${procedureList}

Return ONLY valid JSON (no markdown, no comments, no explanation) with this exact schema:
{
  "diagnosisCodes": [
    {
      "code": "string (ICD-10 code, e.g. 'E11.9')",
      "description": "string",
      "confidence": "high" | "medium" | "low",
      "reasoning": "string"
    }
  ],
  "procedureCodes": [
    {
      "code": "string (CPT code, e.g. '99213')",
      "description": "string",
      "confidence": "high" | "medium" | "low",
      "reasoning": "string"
    }
  ]
}

Rules:
1. Suggest 2-5 ICD-10 diagnosis codes based on clinical findings.
2. Suggest 0-3 CPT procedure codes based on documented procedures.
3. Use "high" confidence only for explicitly documented diagnoses/procedures.
4. Use "medium" confidence for strongly implied diagnoses/procedures.
5. Use "low" confidence for differential or rule-out diagnoses.
6. Include the most specific ICD-10 code available (e.g., E11.9 for Type 2 diabetes without complications).
7. Codes must be valid ICD-10 or CPT codes.`;

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);
    const validated = clinicalCodingResponseSchema.parse(parsed);

    return {
      ...validated,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to suggest clinical codes: ${msg}`);
  }
}

// ── Voice transcription ───────────────────────────────────────────────────────
export interface TranscriptionResult {
  corrected: string;
  soap: {
    S: string;
    O: string;
    A: string;
    P: string;
  };
}

export async function transcribeAndCorrect(text: string): Promise<TranscriptionResult> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text input is required');
  }

  const client = getGeminiClient();
  const safeText = stripPII(text);

  const prompt = `You are a medical scribe. Given raw voice transcription, correct medical terminology, expand abbreviations (e.g. SOB → shortness of breath), add punctuation, and structure the note into SOAP format.

Return ONLY valid JSON (no markdown, no comments, no explanation) with this exact schema:
{
  "corrected": "string - the corrected and punctuated transcription",
  "soap": {
    "S": "string - Subjective (patient's reported symptoms)",
    "O": "string - Objective (physical examination findings)",
    "A": "string - Assessment (clinical assessment)",
    "P": "string - Plan (treatment plan)"
  }
}

Raw transcription:
${safeText}`;

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    return {
      corrected: parsed.corrected || '',
      soap: {
        S: parsed.soap?.S || '',
        O: parsed.soap?.O || '',
        A: parsed.soap?.A || '',
        P: parsed.soap?.P || '',
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to transcribe and correct: ${msg}`);
  }
}
