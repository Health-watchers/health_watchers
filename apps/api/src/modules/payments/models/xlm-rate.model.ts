import { Schema, model, models } from 'mongoose';

export interface XLMRate {
  date: Date;
  rateUSD: number;
}

const xlmRateSchema = new Schema<XLMRate>(
  {
    date: { type: Date, required: true, unique: true, index: true },
    rateUSD: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false }
);

export const XLMRateModel = models.XLMRate || model<XLMRate>('XLMRate', xlmRateSchema);
