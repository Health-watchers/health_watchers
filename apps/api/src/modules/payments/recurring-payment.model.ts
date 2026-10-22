import { Schema, model } from 'mongoose';

const recurringPaymentSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, required: true, index: true },
    amount: { type: String, required: true },
    currency: { type: String, enum: ['XLM', 'USDC'], default: 'XLM' },
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'annually'],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    nextPaymentDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'cancelled', 'completed'],
      default: 'active',
      index: true,
    },
    description: String,
    /** Patient card used for this plan (see PatientPaymentMethod) */
    paymentMethodId: { type: Schema.Types.ObjectId, ref: 'PatientPaymentMethod' },
    pausedAt: Date,
    cancelledAt: Date,
    cancellationReason: { type: String, maxlength: 500 },
    /** Who changed the plan and how — patients self-serve through the portal */
    changeLog: [
      {
        _id: false,
        action: {
          type: String,
          enum: ['created', 'paused', 'resumed', 'cancelled', 'updated', 'payment_method_changed'],
          required: true,
        },
        at: { type: Date, default: () => new Date() },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        byRole: String,
        reason: String,
      },
    ],
    paymentHistory: [
      {
        date: Date,
        intentId: String,
        status: { type: String, enum: ['pending', 'completed', 'failed'] },
        transactionHash: String,
        failureReason: String,
        retryCount: { type: Number, default: 0 },
      },
    ],
    failureCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
  },
  { timestamps: true }
);

recurringPaymentSchema.index({ clinicId: 1, status: 1, nextPaymentDate: 1 });

export const RecurringPayment = model('RecurringPayment', recurringPaymentSchema);
