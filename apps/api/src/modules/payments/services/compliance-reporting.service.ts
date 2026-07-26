import { ComplianceReportModel, ILargeTransaction } from '../models/compliance-report.model';
import { PaymentRecordModel } from '../models/payment-record.model';
import logger from '@api/utils/logger';

interface ComplianceThreshold {
  [key: string]: number; // jurisdiction -> threshold in USD
}

const COMPLIANCE_THRESHOLDS: ComplianceThreshold = {
  NG: 5000000, // Nigeria: 5M NGN equivalent
  US: 10000, // US: $10k CTR requirement
  EU: 10000, // EU: €10k
  GB: 10000, // UK: £10k
  CA: 10000, // Canada: CAD 10k
};

export class ComplianceReportingService {
  async generateComplianceReport(clinicId: string, period: string, jurisdiction: string) {
    const threshold = COMPLIANCE_THRESHOLDS[jurisdiction] || 10000;

    // Parse period (YYYY-MM)
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get all transactions for the period
    const transactions = await PaymentRecordModel.find({
      clinicId,
      status: 'confirmed',
      confirmedAt: { $gte: startDate, $lte: endDate },
    });

    // Filter large transactions
    const largeTransactions: ILargeTransaction[] = transactions
      .filter((tx) => {
        const usdEquiv = parseFloat(tx.usdEquivalent || '0');
        return usdEquiv >= threshold;
      })
      .map((tx) => ({
        txHash: tx.txHash || '',
        amount: tx.amount,
        date: tx.confirmedAt || new Date(),
        counterparty: tx.destination,
        usdEquivalent: tx.usdEquivalent || '0',
      }));

    // Calculate totals
    const totalVolume = {
      xlm: transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0).toString(),
      usdEquivalent: transactions
        .reduce((sum, tx) => sum + parseFloat(tx.usdEquivalent || '0'), 0)
        .toString(),
    };

    // Create or update report
    const report = await ComplianceReportModel.findOneAndUpdate(
      { clinicId, reportingPeriod: period, jurisdiction },
      {
        totalTransactions: transactions.length,
        totalVolume,
        largeTransactions,
        reportGeneratedAt: new Date(),
        status: 'draft',
      },
      { upsert: true, new: true }
    );

    logger.info(`Compliance report generated for ${clinicId} - ${period} - ${jurisdiction}`);
    return report;
  }

  async submitReport(reportId: string, userId: string) {
    return ComplianceReportModel.findByIdAndUpdate(
      reportId,
      {
        status: 'submitted',
        reportedAt: new Date(),
        submittedBy: userId,
      },
      { new: true }
    );
  }

  async acknowledgeReport(reportId: string) {
    return ComplianceReportModel.findByIdAndUpdate(
      reportId,
      {
        status: 'acknowledged',
        acknowledgedAt: new Date(),
      },
      { new: true }
    );
  }

  async getReport(clinicId: string, period: string, jurisdiction: string) {
    return ComplianceReportModel.findOne({
      clinicId,
      reportingPeriod: period,
      jurisdiction,
    });
  }

  async listReports(clinicId: string, limit: number = 20, offset: number = 0) {
    const reports = await ComplianceReportModel.find({ clinicId })
      .sort({ reportingPeriod: -1 })
      .limit(limit)
      .skip(offset);

    const total = await ComplianceReportModel.countDocuments({ clinicId });

    return { reports, total };
  }

  async flagLargeTransaction(txHash: string, clinicId: string) {
    const tx = await PaymentRecordModel.findOne({ txHash, clinicId });
    if (!tx) throw new Error('Transaction not found');

    // Update transaction with flag
    return PaymentRecordModel.findByIdAndUpdate(
      tx._id,
      { $set: { memo: `${tx.memo || ''} [COMPLIANCE_FLAG]` } },
      { new: true }
    );
  }
}

export const complianceReportingService = new ComplianceReportingService();
