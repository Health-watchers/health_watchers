import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@health-watchers/config';
import { stripPII } from './ai.service';

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

export async function generateDifferentialDiagnosis(
  input: DifferentialDiagnosisInput,
): Promise<DifferentialDiagnosisResult> {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Build anonymised clinical context — no patient names or identifiers
  const clinicalContext = stripPII(
    [
      `Chief Complaint: ${input.chiefComplaint}`,
      `Symptoms: ${input.symptoms.join(', ')}`,
      input.vitalSigns
        ? `Vital Signs: ${JSON.stringify(input.vitalSigns)}`
        : '',
      input.patientAge ? `Patient Age: ${input.patientAge} years` : '',
      input.patientSex ? `Patient Sex: ${input.patientSex}` : '',
      input.relevantHistory ? `Relevant History: ${input.relevantHistory}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

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

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Strip possible markdown fences
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: Omit<DifferentialDiagnosisResult, 'disclaimer'>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`AI returned an unparseable response: ${raw.slice(0, 200)}`);
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
