import mongoose, { Schema, Document } from 'mongoose';

export interface IAppointment extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  scheduledAt: Date;
  duration: number; // minutes (default 30)
  type: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  chiefComplaint?: string;
  notes?: string;
  encounterId?: mongoose.Types.ObjectId;
  cancelledBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason?: string;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    scheduledAt: { type: Date, required: true },
    duration: { type: Number, default: 30 },
    type: {
      type: String,
      enum: ['consultation', 'follow-up', 'procedure', 'emergency'],
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'cancelled', 'completed', 'no-show'],
      default: 'scheduled',
    },
    chiefComplaint: { type: String },
    notes: { type: String },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter' },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// Indexes for conflict detection and common queries
AppointmentSchema.index({ doctorId: 1, scheduledAt: 1 });
AppointmentSchema.index({ clinicId: 1, scheduledAt: 1 });
AppointmentSchema.index({ patientId: 1, scheduledAt: -1 });

export const AppointmentModel =
  mongoose.models.Appointment || mongoose.model<IAppointment>('Appointment', AppointmentSchema);
