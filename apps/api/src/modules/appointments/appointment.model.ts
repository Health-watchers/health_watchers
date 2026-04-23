import { Schema, model, models } from 'mongoose';

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

const appointmentSchema = new Schema(
  {
    patientId:       { type: Schema.Types.ObjectId, ref: 'Patient',  required: true, index: true },
    clinicId:        { type: Schema.Types.ObjectId, ref: 'Clinic',   required: true, index: true },
    doctorId:        { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    scheduledAt:     { type: Date,   required: true },
    durationMinutes: { type: Number, required: true, min: 1, default: 30 },
    status:          { type: String, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
    reason:          { type: String, trim: true },
    notes:           { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

// Compound index used by conflict detection query
appointmentSchema.index({ doctorId: 1, scheduledAt: 1 });

export const AppointmentModel =
  models.Appointment || model('Appointment', appointmentSchema);
