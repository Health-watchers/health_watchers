import { Schema, model, models } from 'mongoose';

export interface IFeeTx {
  transactionId: string;
  feeAmount: number;
  timestamp: Date;
}

export interface IClinicFeeBudget {
  clinicId: Schema.Types.ObjectId;
  monthlyBudget: number;   // stroops
  currentSpent: number;    // stroops
  month: string;           // YYYY-MM
  transactions: IFeeTx[];
}

const clinicFeeBudgetSchema = new Schema<IClinicFeeBudget>(
  {
    clinicId:      { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    monthlyBudget: { type: Number, required: true, default: 10_000_000 },
    currentSpent:  { type: Number, required: true, default: 0 },
    month:         { type: String, required: true }, // YYYY-MM
    transactions:  {
      type: [{ transactionId: String, feeAmount: Number, timestamp: { type: Date, default: () => new Date() } }],
      default: [],
    },
  },
  { timestamps: false, versionKey: false }
);

clinicFeeBudgetSchema.index({ clinicId: 1, month: 1 }, { unique: true });

export const ClinicFeeBudgetModel =
  models.ClinicFeeBudget || model<IClinicFeeBudget>('ClinicFeeBudget', clinicFeeBudgetSchema);

export function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
