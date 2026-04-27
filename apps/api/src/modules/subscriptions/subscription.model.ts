import { Schema, Types, model, models } from 'mongoose';
import type { SubscriptionTier } from './subscription.tiers';

export interface ISubscription {
  clinicId: Types.ObjectId;
  tier: SubscriptionTier;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  stellarPaymentAddress?: string;
  lastPaymentIntentId?: string;
  lastPaymentAt?: Date;
  gracePeriodEnd?: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, unique: true, index: true },
    tier: { type: String, enum: ['free', 'basic', 'premium'], required: true },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'cancelled', 'suspended'],
      default: 'active',
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    stellarPaymentAddress: { type: String },
    lastPaymentIntentId: { type: String },
    lastPaymentAt: { type: Date },
    gracePeriodEnd: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

export const SubscriptionModel = models.Subscription || model<ISubscription>('Subscription', subscriptionSchema);
