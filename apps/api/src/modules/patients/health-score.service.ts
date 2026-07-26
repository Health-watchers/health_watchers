import { HealthScoreModel, IHealthScoreFactor } from './models/health-score.model';
import { PatientModel } from './models/patient.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { ImmunizationModel } from '../immunizations/immunization.model';
import logger from '@api/utils/logger';

interface HealthScoreCalculationInput {
  patientId: string;
  clinicId: string;
}

export class HealthScoreService {
  async calculateHealthScore(input: HealthScoreCalculationInput): Promise<number> {
    const { patientId, clinicId } = input;

    const patient = await PatientModel.findById(patientId);
    if (!patient) throw new Error('Patient not found');

    const factors: IHealthScoreFactor[] = [];
    let totalScore = 0;

    // Vital signs check (20 points)
    const vitalSignsScore = await this.checkVitalSigns(patientId);
    if (vitalSignsScore > 0) {
      factors.push({
        name: 'Vital signs within normal range',
        points: vitalSignsScore,
        weight: 0.2,
      });
      totalScore += vitalSignsScore;
    }

    // Chronic conditions check (20 points)
    const chronicScore = patient.riskFactors?.length === 0 ? 20 : 0;
    if (chronicScore > 0) {
      factors.push({ name: 'No chronic conditions', points: chronicScore, weight: 0.2 });
      totalScore += chronicScore;
    }

    // BMI check (15 points)
    const bmiScore = await this.checkBMI(patientId);
    if (bmiScore > 0) {
      factors.push({ name: 'Normal BMI (18.5-24.9)', points: bmiScore, weight: 0.15 });
      totalScore += bmiScore;
    }

    // Lab results check (20 points)
    const labScore = await this.checkLabResults(patientId);
    if (labScore > 0) {
      factors.push({ name: 'Normal lab results', points: labScore, weight: 0.2 });
      totalScore += labScore;
    }

    // Smoking status (10 points)
    const smokingScore = 10; // Default to non-smoker
    factors.push({ name: 'Non-smoker', points: smokingScore, weight: 0.1 });
    totalScore += smokingScore;

    // Exercise (10 points)
    const exerciseScore = 10; // Default to regular exercise
    factors.push({ name: 'Regular exercise', points: exerciseScore, weight: 0.1 });
    totalScore += exerciseScore;

    // Recent hospitalizations (5 points)
    const hospitalizationScore = 5; // Default to no recent hospitalizations
    factors.push({
      name: 'No recent hospitalizations',
      points: hospitalizationScore,
      weight: 0.05,
    });
    totalScore += hospitalizationScore;

    const finalScore = Math.min(100, totalScore);

    // Save health score
    const healthScore = await HealthScoreModel.findOneAndUpdate(
      { patientId },
      {
        clinicId,
        healthScore: finalScore,
        healthScoreLastCalculated: new Date(),
        $push: {
          healthScoreHistory: {
            score: finalScore,
            calculatedAt: new Date(),
            factors,
          },
        },
      },
      { upsert: true, new: true }
    );

    logger.info(`Health score calculated for patient ${patientId}: ${finalScore}`);
    return finalScore;
  }

  private async checkVitalSigns(patientId: string): Promise<number> {
    // Placeholder: In production, fetch from encounters/vital signs collection
    return 20;
  }

  private async checkBMI(patientId: string): Promise<number> {
    // Placeholder: In production, calculate from patient height/weight
    return 15;
  }

  private async checkLabResults(patientId: string): Promise<number> {
    const labResults = await LabResultModel.findOne({ patientId }).sort({ createdAt: -1 });
    if (!labResults) return 0;
    // Placeholder: In production, validate lab values against normal ranges
    return 20;
  }

  async getHealthScore(patientId: string) {
    return HealthScoreModel.findOne({ patientId });
  }

  async getHealthScoreHistory(patientId: string, limit: number = 10) {
    const healthScore = await HealthScoreModel.findOne({ patientId });
    if (!healthScore) return [];
    return healthScore.healthScoreHistory.slice(-limit);
  }
}

export const healthScoreService = new HealthScoreService();
