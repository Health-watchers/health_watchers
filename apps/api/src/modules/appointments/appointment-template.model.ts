import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAppointmentTemplate extends Document {
  clinicId: Types.ObjectId;
  createdBy: Types.ObjectId;
  name: string;
  description?: string;
  type: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
  defaultDurationMinutes: number;
  isTelemedicine: boolean;
  instructions?: string;      // Patient-facing pre-appointment instructions
  internalNotes?: string;     // Staff-facing notes
  bufferBefore: number;       // Buffer time in minutes before the appointment
  bufferAfter: number;        // Buffer time in minutes after the appointment
  isActive: boolean;
  usageCount: number;
}

const AppointmentTemplateSchema = new Schema<IAppointmentTemplate>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 500 },
    type: {
      type: String,
      enum: ['consultation', 'follow-up', 'procedure', 'emergency'],
      required: true,
    },
    defaultDurationMinutes: { type: Number, required: true, min: 5, max: 480 },
    isTelemedicine: { type: Boolean, default: false },
    instructions: { type: String, maxlength: 2000 },
    internalNotes: { type: String, maxlength: 2000 },
    bufferBefore: { type: Number, default: 0, min: 0, max: 60 },
    bufferAfter: { type: Number, default: 0, min: 0, max: 60 },
    isActive: { type: Boolean, default: true, index: true },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

AppointmentTemplateSchema.index({ clinicId: 1, isActive: 1, type: 1 });
AppointmentTemplateSchema.index({ clinicId: 1, name: 1 }, { unique: true });

export const AppointmentTemplateModel = (mongoose.models.AppointmentTemplate ||
  mongoose.model<IAppointmentTemplate>(
    'AppointmentTemplate',
    AppointmentTemplateSchema,
  )) as mongoose.Model<IAppointmentTemplate>;
