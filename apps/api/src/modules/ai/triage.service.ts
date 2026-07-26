import { GoogleGenerativeAI } from '@google/generative-ai';
import { TriageQueue } from './triage.model';
import { TriageAssessmentInput } from './triage.validation';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface TriageResult {
  urgencyLevel: 'immediate' | 'urgent' | 'semi-urgent' | 'non-urgent';
  triageScore: number;
  reasoning: string;
  redFlags: string[];
  recommendedActions: string[];
  estimatedWaitTime: string;
  disclaimer: string;
}

export async function assessTriage(input: TriageAssessmentInput): Promise<TriageResult> {
  const prompt = `You are a medical triage assistant using the Manchester Triage System. Assess the following patient presentation and provide a triage level (1-5):

Chief Complaint: ${input.chiefComplaint}
Symptoms: ${input.symptoms.join(', ')}
Vital Signs: HR=${input.vitalSigns.heartRate}, BP=${input.vitalSigns.bloodPressure}, Temp=${input.vitalSigns.temperature}°C, O2=${input.vitalSigns.oxygenSaturation}%
Age: ${input.patientAge}, Sex: ${input.patientSex}
Onset: ${input.onsetTime}

Respond in JSON format:
{
  "urgencyLevel": "immediate|urgent|semi-urgent|non-urgent",
  "triageScore": 1-5,
  "reasoning": "brief explanation",
  "redFlags": ["flag1", "flag2"],
  "recommendedActions": ["action1", "action2"],
  "estimatedWaitTime": "time estimate"
}`;

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response format');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    ...parsed,
    disclaimer:
      'This assessment is AI-generated and should be reviewed by qualified medical staff. Not a substitute for professional medical judgment.',
  };
}

export async function addToTriageQueue(
  clinicId: string,
  patientId: string,
  input: TriageAssessmentInput,
  triageResult: TriageResult
) {
  return TriageQueue.create({
    clinicId,
    patientId,
    ...input,
    ...triageResult,
  });
}

export async function getTriageQueue(clinicId: string) {
  return TriageQueue.find({ clinicId, status: 'pending' })
    .sort({ urgencyLevel: 1, arrivalTime: 1 })
    .lean();
}

export async function updateTriageStatus(triageId: string, status: string) {
  return TriageQueue.findByIdAndUpdate(triageId, { status }, { new: true });
}
