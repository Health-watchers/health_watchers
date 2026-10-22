import { Schema, Types, model, models, type Model } from 'mongoose';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

/**
 * A card a patient has saved for portal payments.
 *
 * Card numbers never reach this API: the browser tokenizes the card with the payment
 * processor and only the processor token plus display metadata (brand, last 4, expiry) are
 * stored here, keeping the platform out of PCI DSS cardholder-data scope.
 */
export interface IPatientPaymentMethod {
  _id: Types.ObjectId;
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  type: 'card';
  /** Processor token (e.g. a Stripe PaymentMethod id) */
  processorToken: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName?: string;
  isDefault: boolean;
  isActive: boolean;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const patientPaymentMethodSchema = new Schema<IPatientPaymentMethod>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    type: { type: String, enum: ['card'], default: 'card' },
    processorToken: { type: String, required: true, select: false },
    brand: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'discover', 'other'],
      required: true,
    },
    last4: { type: String, required: true, match: /^\d{4}$/ },
    expMonth: { type: Number, required: true, min: 1, max: 12 },
    expYear: { type: Number, required: true, min: 2000, max: 2100 },
    cardholderName: { type: String, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    removedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

patientPaymentMethodSchema.index({ patientId: 1, clinicId: 1, isActive: 1 });
patientPaymentMethodSchema.index({ processorToken: 1 }, { unique: true });

export const PatientPaymentMethodModel = (models.PatientPaymentMethod ||
  model<IPatientPaymentMethod>(
    'PatientPaymentMethod',
    patientPaymentMethodSchema
  )) as Model<IPatientPaymentMethod>;
