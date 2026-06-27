import { EncounterModel } from '../encounters/encounter.model';
import { PatientModel } from '../patients/models/patient.model';
import { PopulationHealthModel } from './population-health.model';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function calculatePopulationMetrics(clinicId: string) {
  const patients = await PatientModel.find({ clinicId, isActive: true });
  const encounters = await EncounterModel.find({ clinicId });

  // Age distribution
  const ageDistribution = calculateAgeDistribution(patients);

  // Disease prevalence (top 10)
  const diseasePrevalence = calculateDiseasePrevalence(encounters);

  // Average vital signs
  const averageVitalSigns = calculateAverageVitalSigns(encounters);

  // Medication usage patterns
  const medicationUsagePatterns = calculateMedicationUsage(patients);

  // Screening compliance
  const screeningComplianceRate = calculateScreeningCompliance(patients);

  // Chronic disease management
  const chronicDiseaseManagementRate = calculateChronicDiseaseManagement(patients);

  return {
    totalPatients: patients.length,
    ageDistribution,
    diseasePrevalence,
    averageVitalSigns,
    medicationUsagePatterns,
    screeningComplianceRate,
    chronicDiseaseManagementRate,
  };
}

export async function generatePopulationInsights(clinicId: string, metrics: any) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Analyze the following population health metrics for a clinic and provide insights:

Total Patients: ${metrics.totalPatients}
Disease Prevalence (Top 10): ${JSON.stringify(metrics.diseasePrevalence)}
Average Vital Signs: ${JSON.stringify(metrics.averageVitalSigns)}
Medication Usage: ${JSON.stringify(metrics.medicationUsagePatterns)}
Screening Compliance Rate: ${metrics.screeningComplianceRate}%
Chronic Disease Management Rate: ${metrics.chronicDiseaseManagementRate}%

Please provide:
1. Key health trends in the population
2. High-risk population segments
3. Recommended population-level interventions
4. Any seasonal health patterns you can infer

Format as JSON with keys: keyTrends (array), highRiskSegments (array), recommendedInterventions (array), seasonalPatterns (array)`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error(`Error generating population insights: ${err}`);
    throw err;
  }
}

export async function detectOutbreaks(clinicId: string, encounters: any[]) {
  const diagnosisCounts: Record<string, number> = {};
  const threshold = 5; // Alert if 5+ cases of same diagnosis in 7 days

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  encounters
    .filter((e) => e.createdAt >= sevenDaysAgo)
    .forEach((e) => {
      if (e.diagnosis) {
        diagnosisCounts[e.diagnosis] = (diagnosisCounts[e.diagnosis] || 0) + 1;
      }
    });

  for (const [diagnosis, count] of Object.entries(diagnosisCounts)) {
    if (count >= threshold) {
      return {
        detected: true,
        diagnosis,
        count,
        threshold,
      };
    }
  }

  return { detected: false };
}

function calculateAgeDistribution(patients: any[]) {
  const ranges = {
    '0-18': 0,
    '19-35': 0,
    '36-50': 0,
    '51-65': 0,
    '65+': 0,
  };

  patients.forEach((p) => {
    if (!p.dateOfBirth) return;
    const age = new Date().getFullYear() - new Date(p.dateOfBirth).getFullYear();
    if (age <= 18) ranges['0-18']++;
    else if (age <= 35) ranges['19-35']++;
    else if (age <= 50) ranges['36-50']++;
    else if (age <= 65) ranges['51-65']++;
    else ranges['65+']++;
  });

  return Object.entries(ranges).map(([range, count]) => ({ range, count }));
}

function calculateDiseasePrevalence(encounters: any[]) {
  const diagnosisCounts: Record<string, number> = {};

  encounters.forEach((e) => {
    if (e.diagnosis) {
      diagnosisCounts[e.diagnosis] = (diagnosisCounts[e.diagnosis] || 0) + 1;
    }
  });

  const total = Object.values(diagnosisCounts).reduce((a, b) => a + b, 0);

  return Object.entries(diagnosisCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([diagnosis, count]) => ({
      diagnosis,
      count,
      percentage: ((count / total) * 100).toFixed(2),
    }));
}

function calculateAverageVitalSigns(encounters: any[]) {
  let systolicSum = 0,
    diastolicSum = 0,
    heartRateSum = 0,
    temperatureSum = 0;
  let count = 0;

  encounters.forEach((e) => {
    if (e.vitalSigns) {
      if (e.vitalSigns.systolicBP) systolicSum += e.vitalSigns.systolicBP;
      if (e.vitalSigns.diastolicBP) diastolicSum += e.vitalSigns.diastolicBP;
      if (e.vitalSigns.heartRate) heartRateSum += e.vitalSigns.heartRate;
      if (e.vitalSigns.temperature) temperatureSum += e.vitalSigns.temperature;
      count++;
    }
  });

  return {
    systolicBP: count > 0 ? Math.round(systolicSum / count) : undefined,
    diastolicBP: count > 0 ? Math.round(diastolicSum / count) : undefined,
    heartRate: count > 0 ? Math.round(heartRateSum / count) : undefined,
    temperature: count > 0 ? (temperatureSum / count).toFixed(1) : undefined,
  };
}

function calculateMedicationUsage(patients: any[]) {
  const medicationCounts: Record<string, number> = {};

  patients.forEach((p) => {
    if (p.medications && Array.isArray(p.medications)) {
      p.medications.forEach((m: any) => {
        const medName = m.name || m;
        medicationCounts[medName] = (medicationCounts[medName] || 0) + 1;
      });
    }
  });

  return Object.entries(medicationCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([medication, count]) => ({ medication, count }));
}

function calculateScreeningCompliance(patients: any[]) {
  const withScreening = patients.filter((p) => p.screeningStatus === 'completed').length;
  return patients.length > 0 ? Math.round((withScreening / patients.length) * 100) : 0;
}

function calculateChronicDiseaseManagement(patients: any[]) {
  const withChronic = patients.filter(
    (p) => p.chronicConditions && p.chronicConditions.length > 0
  ).length;
  return patients.length > 0 ? Math.round((withChronic / patients.length) * 100) : 0;
}
