import { PaymentRecordModel } from '../models/payment-record.model';
import { FraudAlertModel } from '../models/fraud-detection.model';
import logger from '@api/utils/logger';

interface FraudCheckInput {
  amount: string;
  destination: string;
  clinicId: string;
  memo?: string;
}

interface FraudCheckResult {
  fraudScore: number;
  riskFactors: string[];
  isBlocked: boolean;
  requiresReview: boolean;
}

export class FraudDetectionService {
  private readonly THRESHOLDS = {
    LOW_RISK: 30,
    MEDIUM_RISK: 70,
    HIGH_RISK: 100,
  };

  async checkFraud(input: FraudCheckInput): Promise<FraudCheckResult> {
    const { amount, destination, clinicId, memo } = input;
    const riskFactors: string[] = [];
    let fraudScore = 0;

    // Rule 1: Duplicate payment (same amount + destination within 5 minutes)
    const recentPayment = await PaymentRecordModel.findOne({
      clinicId,
      destination,
      amount,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });
    if (recentPayment) {
      fraudScore += 25;
      riskFactors.push('Duplicate payment detected within 5 minutes');
    }

    // Rule 2: Unusual amount (> 3x average)
    const avgAmount = await this.getAverageTransactionAmount(clinicId);
    const amountNum = parseFloat(amount);
    if (avgAmount > 0 && amountNum > avgAmount * 3) {
      fraudScore += 20;
      riskFactors.push(`Unusual amount: ${amountNum} XLM (3x average)`);
    }

    // Rule 3: Rapid succession (> 10 transactions in 1 hour)
    const recentCount = await PaymentRecordModel.countDocuments({
      clinicId,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (recentCount > 10) {
      fraudScore += 15;
      riskFactors.push(`Rapid succession: ${recentCount} transactions in 1 hour`);
    }

    // Rule 4: New destination (first payment to this address)
    const existingDestination = await PaymentRecordModel.findOne({
      clinicId,
      destination,
    });
    if (!existingDestination) {
      fraudScore += 10;
      riskFactors.push('New destination address');
    }

    // Rule 5: Large round number (suspicious)
    if (this.isRoundNumber(amountNum)) {
      fraudScore += 10;
      riskFactors.push('Large round number amount');
    }

    // Rule 6: Unusual time (outside clinic working hours - 8 AM to 6 PM)
    const hour = new Date().getHours();
    if (hour < 8 || hour > 18) {
      fraudScore += 5;
      riskFactors.push('Transaction outside clinic working hours');
    }

    const isBlocked = fraudScore >= this.THRESHOLDS.HIGH_RISK;
    const requiresReview =
      fraudScore >= this.THRESHOLDS.MEDIUM_RISK && fraudScore < this.THRESHOLDS.HIGH_RISK;

    logger.info(
      `Fraud check completed: score=${fraudScore}, blocked=${isBlocked}, factors=${riskFactors.length}`
    );

    return {
      fraudScore: Math.min(100, fraudScore),
      riskFactors,
      isBlocked,
      requiresReview,
    };
  }

  async createFraudAlert(
    paymentIntentId: string,
    clinicId: string,
    fraudScore: number,
    riskFactors: string[]
  ) {
    return FraudAlertModel.create({
      paymentIntentId,
      clinicId,
      fraudScore,
      riskFactors,
      status: 'pending',
    });
  }

  async getFraudReviewQueue(clinicId: string, limit: number = 20, offset: number = 0) {
    return FraudAlertModel.find({
      clinicId,
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);
  }

  async approveFraudAlert(alertId: string, reviewedBy: string, notes?: string) {
    return FraudAlertModel.findByIdAndUpdate(
      alertId,
      {
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date(),
        notes,
      },
      { new: true }
    );
  }

  async rejectFraudAlert(alertId: string, reviewedBy: string, notes?: string) {
    return FraudAlertModel.findByIdAndUpdate(
      alertId,
      {
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        notes,
      },
      { new: true }
    );
  }

  private async getAverageTransactionAmount(clinicId: string): Promise<number> {
    const result = await PaymentRecordModel.aggregate([
      { $match: { clinicId, status: 'confirmed' } },
      { $group: { _id: null, avg: { $avg: { $toDouble: '$amount' } } } },
    ]);
    return result[0]?.avg || 0;
  }

  private isRoundNumber(amount: number): boolean {
    const roundNumbers = [100, 500, 1000, 5000, 10000];
    return roundNumbers.includes(amount);
  }
}

export const fraudDetectionService = new FraudDetectionService();
