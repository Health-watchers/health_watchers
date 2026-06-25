import { Schema, model, models } from 'mongoose';

export interface PaymentRecord {
  intentId: string;
  amount: string;
  destination: string;
  memo?: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  confirmedAt?: Date;
  clinicId: string;
  patientId?: string;
  assetCode: string;
  assetIssuer?: string | null;
  // Path payment fields
  sourceAssetCode?: string;
  sourceAssetIssuer?: string | null;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
  feeStrategy?: 'slow' | 'standard' | 'fast';
  // Fee sponsorship fields
  sponsorFees?: boolean;
  sponsoredFeeAmount?: string;
  feeBumpHash?: string;
  // Claimable balance fields
  claimableBalanceId?: string;
  claimableAfter?: Date;
  claimableUntil?: Date;
  claimed?: boolean;
  claimedAt?: Date;
  encounterId?: string;
  // Receipt fields
  receiptNumber?: string;
  receiptUrl?: string;
  usdEquivalent?: string;
  exchangeRate?: string;
  receiptGeneratedAt?: Date;
  // Expiry fields
  expiresAt?: Date;
  paymentType?: 'immediate' | 'multisig' | 'escrow';
  // Claimable balance expiry notification flag
  claimableExpiryNotificationSent?: boolean;
  idempotencyKey?: string;
}

const paymentRecordSchema = new Schema<PaymentRecord>(
  {
    intentId: { type: String, required: true, unique: true },
    amount: { type: String, required: true },
    destination: { type: String, required: true },
    memo: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'pending',
      index: true,
    },
    txHash: { type: String, index: true },
    confirmedAt: { type: Date },
    clinicId: { type: String, required: true, index: true },
    patientId: { type: String, index: true },
    assetCode: { type: String, required: true, default: 'XLM', uppercase: true, trim: true },
    assetIssuer: { type: String, default: null },
    // Path payment fields
    sourceAssetCode: { type: String, uppercase: true, trim: true },
    sourceAssetIssuer: { type: String, default: null },
    destinationAmount: { type: String },
    maxSourceAmount: { type: String },
    path: { type: [String], default: undefined },
    feeStrategy: { type: String, enum: ['slow', 'standard', 'fast'], default: 'standard' },
    // Fee sponsorship fields
    sponsorFees: { type: Boolean, default: false },
    sponsoredFeeAmount: { type: String },
    feeBumpHash: { type: String, index: true },
    // Claimable balance fields
    claimableBalanceId: { type: String, index: true },
    claimableAfter: { type: Date },
    claimableUntil: { type: Date },
    claimed: { type: Boolean, default: false, index: true },
    claimedAt: { type: Date },
    encounterId: { type: String, index: true },
    // Receipt fields
    receiptNumber: { type: String, index: true },
    receiptUrl: { type: String },
    usdEquivalent: { type: String },
    exchangeRate: { type: String },
    receiptGeneratedAt: { type: Date },
    // Expiry fields
    expiresAt: { type: Date, index: true },
    paymentType: { type: String, enum: ['immediate', 'multisig', 'escrow'], default: 'immediate' },
    // Claimable balance expiry notification flag
    claimableExpiryNotificationSent: { type: Boolean, default: false, index: true },
    idempotencyKey: { type: String, index: true, sparse: true, unique: true },
  },
  { timestamps: true, versionKey: false }
);

paymentRecordSchema.index({ status: 1, createdAt: 1 });
paymentRecordSchema.index({ memo: 1, clinicId: 1 });
paymentRecordSchema.index({ clinicId: 1, createdAt: -1 });        // List payments for clinic
paymentRecordSchema.index({ clinicId: 1, status: 1 });            // Filter by status
paymentRecordSchema.index({ txHash: 1 }, { sparse: true });       // Lookup by transaction hash
paymentRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 86400, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export const PaymentRecordModel =
  models.PaymentRecord || model<PaymentRecord>('PaymentRecord', paymentRecordSchema);
