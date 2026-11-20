import { EncounterModel } from '../encounters/encounter.model';
import { PatientModel } from '../patients/models/patient.model';
import { PopulationHealthModel } from './population-health.model';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface CohortFilters {
  ageGroup?: string;
  gender?: string;
  clinicBranch?: string;
}

const AGE_GROUP_RANGES: Record<string, { min: number; max: number }> = {
  '0-18': { min: 0, max: 18 },
  '19-35': { min: 19, max: 35 },
  '36-50': { min: 36, max: 50 },
  '51-65': { min: 51, max: 65 },
  '65+': { min: 65, max: 150 },
};

function getAge(dateOfBirth: any): number | null {
  if (!dateOfBirth) return null;
  return new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
}

function buildPatientQuery(clinicId: string, filters: CohortFilters = {}) {
  const query: Record<string, any> = { clinicId, isActive: true };

  if (filters.gender) {
    query.gender = filters.gender;
  }

  if (filters.clinicBranch) {
    query.clinicBranch = filters.clinicBranch;
  }

  if (filters.ageGroup && AGE_GROUP_RANGES[filters.ageGroup]) {
    const { min, max } = AGE_GROUP_RANGES[filters.ageGroup];
    const now = new Date();
    const latestDob = new Date(now.getFullYear() - min, now.getMonth(), now.getDate());
    const earliestDob = new Date(now.getFullYear() - max - 1, now.getMonth(), now.getDate() + 1);
    query.dateOfBirth = { $gte: earliestDob, $lte: latestDob };
  }

  return query;
}

function buildEncounterQuery(clinicId: string, filters: CohortFilters = {}, patientIds?: any[]) {
  const query: Record<string, any> = { clinicId };

  if (filters.clinicBranch) {
    query.clinicBranch = filters.clinicBranch;
  }

  if (patientIds) {
    query.patientId = { $in: patientIds };
  }

  return query;
}

export async function calculatePopulationMetrics(
  clinicId: string,
  filters: CohortFilters = {}
) {
  const patients = await PatientModel.find(buildPatientQuery(clinicId, filters));
  const patientIds = patients.map((p: any) => p._id);
  const encounters = await EncounterModel.find(
    buildEncounterQuery(clinicId, filters, patientIds)
  );

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

  // Vaccination coverage
  const vaccinationCoverage = calculateVaccinationCoverage(patients);

  // Chronic disease distribution
  const chronicDiseaseDistribution = calculateChronicDiseaseDistribution(patients);

  return {
    totalPatients: patients.length,
    filters,
    ageDistribution,
    diseasePrevalence,
    averageVitalSigns,
    medicationUsagePatterns,
    screeningComplianceRate,
    chronicDiseaseManagementRate,
    vaccinationCoverage,
    chronicDiseaseDistribution,
  };
}

export async function calculateTrends(
  clinicId: string,
  filters: CohortFilters = {},
  period: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
) {
  const patients = await PatientModel.find(buildPatientQuery(clinicId, filters));
  const patientIds = patients.map((p: any) => p._id);
  const encounters = await EncounterModel.find(
    buildEncounterQuery(clinicId, filters, patientIds)
  );

  const buckets: Record<string, { start: Date; end: Date }> = {};
  const now = new Date();

  const bucketCount = period === 'monthly' ? 12 : period === 'quarterly' ? 8 : 5;

  for (let i = bucketCount - 1; i >= 0; i--) {
    let start: Date;
    let end: Date;
    let key: string;

    if (period === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'quarterly') {
      const quarter = Math.floor(now.getMonth() / 3) - i;
      start = new Date(now.getFullYear(), quarter * 3, 1);
      end = new Date(now.getFullYear(), quarter * 3 + 3, 1);
      key = `${start.getFullYear()}-Q${Math.floor(start.getMonth() / 3) + 1}`;
    } else {
      start = new Date(now.getFullYear() - i, 0, 1);
      end = new Date(now.getFullYear() - i + 1, 0, 1);
      key = `${start.getFullYear()}`;
    }

    buckets[key] = { start, end };
  }

  const trends = Object.entries(buckets).map(([label, { start, end }]) => {
    const bucketEncounters = encounters.filter((e: any) => {
      const createdAt = new Date(e.createdAt);
      return createdAt >= start && createdAt < end;
    });

    const bucketPatients = patients.filter((p: any) => {
      const createdAt = new Date(p.createdAt || p.dateOfBirth || now);
      return createdAt < end;
    });

    const prevalence = calculateDiseasePrevalence(bucketEncounters);
    const vaccinationCoverage = calculateVaccinationCoverage(bucketPatients);
    const chronicDiseaseDistribution = calculateChronicDiseaseDistribution(bucketPatients);

    return {
      label,
      start: start.toISOString(),
      end: end.toISOString(),
      topDiagnoses: prevalence.slice(0, 5),
      vaccinationCoverage,
      chronicDiseaseCount: chronicDiseaseDistribution.reduce(
        (sum, item) => sum + item.count,
        0
      ),
      chronicDiseaseDistribution,
    };
  });

  return { period, filters, trends };
}

export async function getHighRiskCohorts(clinicId: string, filters: CohortFilters = {}) {
  const patients = await PatientModel.find(buildPatientQuery(clinicId, filters));
  const patientIds = patients.map((p: any) => p._id);
  const encounters = await EncounterModel.find(
    buildEncounterQuery(clinicId, filters, patientIds)
  );

  const metrics = {
    totalPatients: patients.length,
    ageDistribution: calculateAgeDistribution(patients),
    diseasePrevalence: calculateDiseasePrevalence(encounters),
    averageVitalSigns: calculateAverageVitalSigns(encounters),
    medicationUsagePatterns: calculateMedicationUsage(patients),
    screeningComplianceRate: calculateScreeningCompliance(patients),
    chronicDiseaseManagementRate: calculateChronicDiseaseManagement(patients),
    vaccinationCoverage: calculateVaccinationCoverage(patients),
    chronicDiseaseDistribution: calculateChronicDiseaseDistribution(patients),
  };

  let insights: any = null;
  try {
    insights = await generatePopulationInsights(clinicId, metrics);
  } catch (err) {
    logger.error(`Error generating high risk cohorts insights: ${err}`);
  }

  const cohorts: Array<{
    name: string;
    description: string;
    riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    patientCount: number;
    factors: string[];
  }> = [];

  if (insights && Array.isArray(insights.highRiskSegments)) {
    insights.highRiskSegments.forEach((segment: any, index: number) => {
      const name =
        typeof segment === 'string'
          ? segment
          : segment.name || segment.segment || `High Risk Cohort ${index + 1}`;
      const description =
        typeof segment === 'string'
          ? segment
          : segment.description || segment.reason || '';
      const riskLevel =
        typeof segment === 'object' && segment.riskLevel
          ? segment.riskLevel
          : 'high';
      const patientCount =
        typeof segment === 'object' && typeof segment.patientCount === 'number'
          ? segment.patientCount
          : 0;
      const factors =
        typeof segment === 'object' && Array.isArray(segment.factors)
          ? segment.factors
          : [];

      cohorts.push({ name, description, riskLevel, patientCount, factors });
    });
  }

  // Fallback deterministic cohorts based on metrics when AI yields nothing
  if (cohorts.length === 0) {
    const chronic = metrics.chronicDiseaseDistribution;
    chronic.forEach((item) => {
      if (item.count > 0) {
        cohorts.push({
          name: `${item.condition} patients`,
          description: `${item.count} patients with ${item.condition}`,
          riskLevel: item.count > patients.length * 0.2 ? 'high' : 'moderate',
          patientCount: item.count,
          factors: [item.condition],
        });
      }
    });

    if (metrics.screeningComplianceRate < 50 && patients.length > 0) {
      cohorts.push({
        name: 'Low screening compliance',
        description: `Only ${metrics.screeningComplianceRate}% of patients completed screenings`,
        riskLevel: 'high',
        patientCount: patients.length,
        factors: ['screening'],
      });
    }
  }

  return { filters, cohorts };
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

function calculateVaccinationCoverage(patients: any[]) {
  const vaccinationCounts: Record<string, number> = {};
  let vaccinatedPatients = 0;

  patients.forEach((p) => {
    const vaccinations = Array.isArray(p.vaccinations) ? p.vaccinations : [];
    if (vaccinations.length > 0) vaccinatedPatients++;
    vaccinations.forEach((v: any) => {
      const name = typeof v === 'string' ? v : v.name || v.vaccine;
      if (name) {
        vaccinationCounts[name] = (vaccinationCounts[name] || 0) + 1;
      }
    });
  });

  const overallCoverage =
    patients.length > 0 ? Math.round((vaccinatedPatients / patients.length) * 100) : 0;

  const byVaccine = Object.entries(vaccinationCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([vaccine, count]) => ({
      vaccine,
      count,
      coverage:
        patients.length > 0 ? Number(((count / patients.length) * 100).toFixed(2)) : 0,
    }));

  return { overallCoverage, byVaccine };
}

function calculateChronicDiseaseDistribution(patients: any[]) {
  const conditionCounts: Record<string, number> = {};

  patients.forEach((p) => {
    if (Array.isArray(p.chronicConditions)) {
      p.chronicConditions.forEach((c: any) => {
        const name = typeof c === 'string' ? c : c.name || c.condition;
        if (name) {
          conditionCounts[name] = (conditionCounts[name] || 0) + 1;
        }
      });
    }
  });

  return Object.entries(conditionCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([condition, count]) => ({
      condition,
      count,
      percentage:
        patients.length > 0 ? Number(((count / patients.length) * 100).toFixed(2)) : 0,
    }));
}
