import { Schema, model, models } from 'mongoose';

export interface XLMRate {
  /** Timestamp the rate is effective at. Daily aggregates use start-of-day; intraday samples use the precise fetch time. */
  date: Date;
  /** XLM → USD rate. */
  rateUSD: number;
  /** Where the rate came from (e.g. 'coingecko', 'stellar-dex', 'manual', 'fallback'). */
  source?: string;
}

const xlmRateSchema = new Schema<XLMRate>(
  {
    date: { type: Date, required: true, unique: true, index: true },
    rateUSD: { type: Number, required: true },
    source: { type: String, default: 'manual' },
  },
  { timestamps: true, versionKey: false }
);

export const XLMRateModel = models.XLMRate || model<XLMRate>('XLMRate', xlmRateSchema);
