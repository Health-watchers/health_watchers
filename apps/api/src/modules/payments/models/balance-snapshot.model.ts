import { Schema, Types, model, models } from 'mongoose';

export interface IBalanceSnapshot {
  clinicId: Types.ObjectId;
  date: Date;
  xlmBalance: string;
  usdcBalance: string | null;
  createdAt: Date;
}

const balanceSnapshotSchema = new Schema<IBalanceSnapshot>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    date: { type: Date, required: true },
    xlmBalance: { type: String, required: true },
    usdcBalance: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

// One snapshot per clinic per day
balanceSnapshotSchema.index({ clinicId: 1, date: -1 }, { unique: true });

export const BalanceSnapshotModel =
  models.BalanceSnapshot || model<IBalanceSnapshot>('BalanceSnapshot', balanceSnapshotSchema);
