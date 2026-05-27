import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { ClinicModel } from '../clinics/clinic.model';
import logger from '@api/utils/logger';

export interface ClinicMetrics {
  clinicId: string;
  encountersPerPatientPerYear: number;
  averageEncounterDuration: number;
  paymentSuccessRate: number;
  patientRetentionRate: number;
  aiSummaryAdoptionRate: number;
  averageTimeToCloseEncounter: number;
  totalPatients: number;
  totalEncounters: number;
}

export interface BenchmarkPercentiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface BenchmarkComparison {
  metric: string;
  clinicValue: number;
  percentiles: BenchmarkPercentiles;
  percentileRank: number; // 0-100
}

export interface ClinicBenchmark {
  clinicId: string;
  category: 'small' | 'medium' | 'large';
  metrics: ClinicMetrics;
  comparisons: BenchmarkComparison[];
  lastUpdated: Date;
}

/**
 * Calculate metrics for a single clinic
 */
export async function calculateClinicMetrics(clinicId: string): Promise<ClinicMetrics> {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [patients, encounters, payments, aiEncounters] = await Promise.all([
    PatientModel.countDocuments({ clinicId, isActive: true }),
    EncounterModel.find({ clinicId, createdAt: { $gte: oneYearAgo } }).lean(),
    PaymentRecordModel.find({ clinicId, createdAt: { $gte: oneYearAgo } }).lean(),
    EncounterModel.countDocuments({ clinicId, aiSummary: { $exists: true, $ne: null } }),
  ]);

  const totalPatients = patients;
  const totalEncounters = encounters.length;

  // Encounters per patient per year
  const encountersPerPatientPerYear = totalPatients > 0 ? totalEncounters / totalPatients : 0;

  // Average encounter duration (in minutes)
  const avgDuration =
    encounters.length > 0
      ? encounters.reduce((sum, e) => {
          const start = new Date(e.createdAt).getTime();
          const end = e.closedAt ? new Date(e.closedAt).getTime() : Date.now();
          return sum + (end - start) / (1000 * 60);
        }, 0) / encounters.length
      : 0;

  // Payment success rate
  const successfulPayments = payments.filter((p) => p.status === 'confirmed').length;
  const paymentSuccessRate = payments.length > 0 ? (successfulPayments / payments.length) * 100 : 0;

  // Patient retention rate (patients with 2+ encounters in past year)
  const patientEncounterCounts = new Map<string, number>();
  encounters.forEach((e) => {
    const count = patientEncounterCounts.get(String(e.patientId)) || 0;
    patientEncounterCounts.set(String(e.patientId), count + 1);
  });
  const returningPatients = Array.from(patientEncounterCounts.values()).filter((c) => c >= 2).length;
  const patientRetentionRate = totalPatients > 0 ? (returningPatients / totalPatients) * 100 : 0;

  // AI summary adoption rate
  const aiAdoptionRate = totalEncounters > 0 ? (aiEncounters / totalEncounters) * 100 : 0;

  // Average time to close encounter (in hours)
  const closedEncounters = encounters.filter((e) => e.closedAt);
  const avgTimeToClose =
    closedEncounters.length > 0
      ? closedEncounters.reduce((sum, e) => {
          const start = new Date(e.createdAt).getTime();
          const end = new Date(e.closedAt!).getTime();
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0) / closedEncounters.length
      : 0;

  return {
    clinicId,
    encountersPerPatientPerYear,
    averageEncounterDuration: Math.round(avgDuration * 10) / 10,
    paymentSuccessRate: Math.round(paymentSuccessRate * 10) / 10,
    patientRetentionRate: Math.round(patientRetentionRate * 10) / 10,
    aiSummaryAdoptionRate: Math.round(aiAdoptionRate * 10) / 10,
    averageTimeToCloseEncounter: Math.round(avgTimeToClose * 10) / 10,
    totalPatients,
    totalEncounters,
  };
}

/**
 * Categorize clinic by patient count
 */
function categorizeClinic(patientCount: number): 'small' | 'medium' | 'large' {
  if (patientCount < 100) return 'small';
  if (patientCount < 500) return 'medium';
  return 'large';
}

/**
 * Calculate percentiles for a metric across all clinics in a category
 */
async function calculatePercentiles(
  category: 'small' | 'medium' | 'large',
  metricKey: keyof ClinicMetrics,
  excludeClinicId?: string
): Promise<BenchmarkPercentiles> {
  // Get all clinics in category
  const clinics = await ClinicModel.find({ isActive: true }).lean();
  const categoryClinicIds = clinics
    .filter((c) => {
      if (excludeClinicId && c._id.toString() === excludeClinicId) return false;
      const patientCount = (c as any).patientCount || 0;
      return categorizeClinic(patientCount) === category;
    })
    .map((c) => c._id.toString());

  if (categoryClinicIds.length === 0) {
    return { p25: 0, p50: 0, p75: 0, p90: 0 };
  }

  // Calculate metrics for all clinics in category
  const metrics = await Promise.all(categoryClinicIds.map((id) => calculateClinicMetrics(id)));
  const values = metrics.map((m) => m[metricKey] as number).sort((a, b) => a - b);

  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  };

  return {
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
  };
}

/**
 * Calculate percentile rank (0-100) for a value within a distribution
 */
function calculatePercentileRank(value: number, percentiles: BenchmarkPercentiles): number {
  if (value <= percentiles.p25) return 25;
  if (value <= percentiles.p50) return 50;
  if (value <= percentiles.p75) return 75;
  if (value <= percentiles.p90) return 90;
  return 100;
}

/**
 * Get benchmark comparison for a clinic
 */
export async function getBenchmarkComparison(clinicId: string): Promise<ClinicBenchmark> {
  const metrics = await calculateClinicMetrics(clinicId);
  const category = categorizeClinic(metrics.totalPatients);

  const metricKeys: (keyof ClinicMetrics)[] = [
    'encountersPerPatientPerYear',
    'averageEncounterDuration',
    'paymentSuccessRate',
    'patientRetentionRate',
    'aiSummaryAdoptionRate',
    'averageTimeToCloseEncounter',
  ];

  const comparisons: BenchmarkComparison[] = await Promise.all(
    metricKeys.map(async (key) => {
      const percentiles = await calculatePercentiles(category, key, clinicId);
      const clinicValue = metrics[key] as number;
      const percentileRank = calculatePercentileRank(clinicValue, percentiles);

      return {
        metric: key,
        clinicValue,
        percentiles,
        percentileRank,
      };
    })
  );

  logger.info(
    { clinicId, category, metricCount: comparisons.length },
    'Benchmark comparison calculated'
  );

  return {
    clinicId,
    category,
    metrics,
    comparisons,
    lastUpdated: new Date(),
  };
}
