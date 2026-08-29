import mongoose, { Schema, Document, Types } from 'mongoose';

export type VaccineLotStatus = 'active' | 'low' | 'depleted' | 'expired' | 'recalled';

export interface IVaccineLot extends Document {
  clinicId: Types.ObjectId;
  lotNumber: string;
  vaccineCode: string;
  vaccineName: string;
  manufacturer: string;
  supplier?: string;
  expiryDate: Date;
  /** Total doses received from the supplier (supply chain intake). */
  quantityReceived: number;
  /** Doses administered to patients. */
  quantityAdministered: number;
  /** Doses wasted, damaged, or discarded. */
  quantityWasted: number;
  /** When remaining stock falls to or below this level the lot is flagged "low". */
  reorderThreshold: number;
  status: VaccineLotStatus;
  receivedAt: Date;
  recalledReason?: string;
  recalledAt?: Date;
  notes?: string;
}

const VaccineLotSchema = new Schema<IVaccineLot>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    lotNumber: { type: String, required: true, trim: true },
    vaccineCode: { type: String, required: true, trim: true, index: true },
    vaccineName: { type: String, required: true, trim: true },
    manufacturer: { type: String, required: true, trim: true },
    supplier: { type: String, trim: true },
    expiryDate: { type: Date, required: true, index: true },
    quantityReceived: { type: Number, required: true, min: 0, default: 0 },
    quantityAdministered: { type: Number, min: 0, default: 0 },
    quantityWasted: { type: Number, min: 0, default: 0 },
    reorderThreshold: { type: Number, min: 0, default: 10 },
    status: {
      type: String,
      enum: ['active', 'low', 'depleted', 'expired', 'recalled'],
      default: 'active',
      index: true,
    },
    receivedAt: { type: Date, default: Date.now },
    recalledReason: { type: String },
    recalledAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

VaccineLotSchema.index({ clinicId: 1, lotNumber: 1 }, { unique: true });
VaccineLotSchema.index({ clinicId: 1, status: 1, expiryDate: 1 });

export const VaccineLotModel = (mongoose.models.VaccineLot ||
  mongoose.model<IVaccineLot>(
    'VaccineLot',
    VaccineLotSchema
  )) as import('mongoose').Model<IVaccineLot>;
