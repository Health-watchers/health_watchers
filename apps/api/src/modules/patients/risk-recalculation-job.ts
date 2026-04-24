import logger from '@api/utils/logger';
import { calculateRiskScore } from '../ai/risk-calculator';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let jobTimer: NodeJS.Timeout | null = null;

export async function runRiskRecalculation(): Promise<void> {
  logger.info('Risk recalculation job started');

  const { PatientModel } = await import('./models/patient.model');
  const { RiskScoreHistoryModel } = await import('./models/risk-score-history.model');
  const { EncounterModel } = await import('../encounters/encounter.model');
  const { LabResultModel } = await import('../lab-results/lab-result.model');
  const { AppointmentModel } = await import('../appointments/appointment.model');
  const { UserModel } = await import('../auth/models/user.model');
  const { createNotification } = await import('../notifications/notification.service');

  const patients = await PatientModel.find({ isActive: true }).lean();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let flagged = 0;

  for (const patient of patients) {
    try {
      const patientId = String(patient._id);
      const clinicId = String(patient.clinicId);

      const [encounters, labResults, missedAppts] = await Promise.all([
        EncounterModel.find({ patientId, clinicId }).sort({ createdAt: -1 }).limit(20).lean(),
        LabResultModel.find({ patientId, clinicId, status: 'resulted' }).sort({ createdAt: -1 }).limit(10).lean(),
        AppointmentModel.countDocuments({ patientId, clinicId, status: 'no-show', scheduledAt: { $gte: ninetyDaysAgo } }),
      ]);

      const dobStr = (patient as any).dateOfBirth as string;
      const ageYears = dobStr ? Math.floor((Date.now() - new Date(dobStr).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
      const allDiagnoses = encounters.flatMap((e) => (e.diagnosis ?? []).map((d: any) => d.description ?? d.code ?? ''));
      const recentHospitalization = encounters.some((e) => {
        const d = (e as any).createdAt as Date;
        return d && new Date(d) >= ninetyDaysAgo && e.status === 'closed';
      });
      const abnormalLabCount = labResults.reduce((n, lr) => n + (lr.results ?? []).filter((r: any) => r.flag && r.flag !== 'N').length, 0);
      const highBP = encounters.some((e) => {
        const bp = e.vitalSigns?.bloodPressure;
        if (!bp) return false;
        const [sys] = bp.split('/').map(Number);
        return sys >= 140;
      });
      const latestWeight = encounters.find((e) => e.vitalSigns?.weight)?.vitalSigns?.weight;
      const latestHeight = encounters.find((e) => e.vitalSigns?.height)?.vitalSigns?.height;
      const bmiOver30 = latestWeight && latestHeight ? (latestWeight / ((latestHeight / 100) ** 2)) > 30 : false;
      const smokingHistory = allDiagnoses.some((d) => d.toLowerCase().includes('smok'));

      const { score, level, factors } = calculateRiskScore({
        ageYears, diagnoses: allDiagnoses, recentHospitalization,
        missedAppointments: missedAppts, abnormalLabCount,
        highBloodPressure: highBP, bmiOver30: !!bmiOver30, smokingHistory,
      });

      const previousLevel = (patient as any).riskLevel;
      const levelEscalated = isEscalation(previousLevel, level);

      const now = new Date();
      await PatientModel.findByIdAndUpdate(patientId, {
        riskScore: score, riskLevel: level, riskFactors: factors,
        lastRiskCalculatedAt: now, nextRiskReviewDate: new Date(now.getTime() + WEEK_MS),
      });

      await RiskScoreHistoryModel.create({
        patientId, clinicId, riskScore: score, riskLevel: level,
        riskFactors: factors, calculatedAt: now, source: 'scheduled',
      });

      // Notify CLINIC_ADMIN if risk escalated to high/critical
      if (levelEscalated && (level === 'high' || level === 'critical')) {
        flagged++;
        const admins = await UserModel.find({ clinicId, role: 'CLINIC_ADMIN', isActive: true }).lean();
        for (const admin of admins) {
          await createNotification({
            userId: admin._id,
            clinicId,
            type: 'high_risk_patient',
            title: 'High-Risk Patient Alert',
            message: `Patient ${(patient as any).firstName} ${(patient as any).lastName} risk level escalated to ${level} (score: ${score})`,
            link: `/patients/${patientId}`,
            metadata: { patientId, riskScore: score, riskLevel: level },
          });
        }
      }
    } catch (err) {
      logger.error({ err, patientId: patient._id }, 'Risk recalculation failed for patient');
    }
  }

  logger.info({ total: patients.length, flagged }, 'Risk recalculation job completed');
}

function isEscalation(prev: string | undefined, next: string): boolean {
  const order = ['low', 'medium', 'high', 'critical'];
  return order.indexOf(next) > order.indexOf(prev ?? 'low');
}

export function startRiskRecalculationJob(): void {
  // Run immediately then weekly
  runRiskRecalculation().catch((err) => logger.error({ err }, 'Initial risk recalculation failed'));
  jobTimer = setInterval(() => {
    runRiskRecalculation().catch((err) => logger.error({ err }, 'Weekly risk recalculation failed'));
  }, WEEK_MS);
  logger.info('Weekly risk recalculation job scheduled');
}

export function stopRiskRecalculationJob(): void {
  if (jobTimer) { clearInterval(jobTimer); jobTimer = null; }
}
