import { Schema, model, models } from 'mongoose';

export interface ILargeTransaction {
  txHash: string;
  amount: string;
  date: Date;
  counterparty: string;
  usdEquivalent: string;
}

export interface IComplianceReport {
  clinicId: string;
  reportingPeriod: string; // YYYY-MM format
  jurisdiction: string; // Country code
  totalTransactions: number;
  totalVolume: {
    xlm: string;
    usdEquivalent: string;
  };
  largeTransactions: ILargeTransaction[];
  reportGeneratedAt: Date;
  reportedAt?: Date;
  status: 'draft' | 'submitted' | 'acknowledged';
  submittedBy?: string;
  acknowledgedAt?: Date;
}

const largeTransactionSchema = new Schema<ILargeTransaction>(
  {
    txHash: { type: String, required: true },
    amount: { type: String, required: true },
    date: { type: Date, required: true },
    counterparty: { type: String, required: true },
    usdEquivalent: { type: String, required: true },
  },
  { _id: false }
);

const complianceReportSchema = new Schema<IComplianceReport>(
  {
    clinicId: { type: String, required: true, index: true },
    reportingPeriod: { type: String, required: true, index: true },
    jurisdiction: { type: String, required: true, index: true },
    totalTransactions: { type: Number, required: true },
    totalVolume: {
      xlm: { type: String, required: true },
      usdEquivalent: { type: String, required: true },
    },
    largeTransactions: { type: [largeTransactionSchema], default: [] },
    reportGeneratedAt: { type: Date, default: () => new Date() },
    reportedAt: { type: Date },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'acknowledged'],
      default: 'draft',
      index: true,
    },
    submittedBy: { type: String },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

complianceReportSchema.index(
  { clinicId: 1, reportingPeriod: 1, jurisdiction: 1 },
  { unique: true }
);
complianceReportSchema.index({ status: 1, createdAt: 1 });

export const ComplianceReportModel = (models.ComplianceReport ||
  model<IComplianceReport>(
    'ComplianceReport',
    complianceReportSchema
  )) as import('mongoose').Model<IComplianceReport>;
