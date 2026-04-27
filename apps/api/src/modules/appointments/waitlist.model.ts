import { Schema, model, models, Types } from 'mongoose';

export interface IWaitlist {
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  requestedDate: Date;
  appointmentType: 'consultation' | 'follow-up' | 'procedure' | 'emergency';
  priority: 'routine' | 'urgent';
  priorityOrder: number; // 1 = urgent, 0 = routine
  status: 'waiting' | 'notified' | 'booked' | 'expired';
  position: number;
  addedAt: Date;
  notifiedAt?: Date;
  expiresAt?: Date; // 48h after notified
}

const waitlistSchema = new Schema<IWaitlist>(
  {
    patientId:       { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId:        { type: Schema.Types.ObjectId, ref: 'Clinic',  required: true, index: true },
    doctorId:        { type: Schema.Types.ObjectId, ref: 'User' },
    requestedDate:   { type: Date, required: true },
    appointmentType: { type: String, enum: ['consultation', 'follow-up', 'procedure', 'emergency'], required: true },
    priority:        { type: String, enum: ['routine', 'urgent'], default: 'routine' },
    // Numeric mirror of priority for reliable sort: urgent=1, routine=0
    priorityOrder:   { type: Number, default: 0 },
    status:          { type: String, enum: ['waiting', 'notified', 'booked', 'expired'], default: 'waiting', index: true },
    position:        { type: Number, required: true },
    addedAt:         { type: Date, default: () => new Date() },
    notifiedAt:      { type: Date },
    expiresAt:       { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: false, versionKey: false }
);

waitlistSchema.index({ clinicId: 1, status: 1, priority: -1, addedAt: 1 });
waitlistSchema.index({ clinicId: 1, doctorId: 1, status: 1 });

export const WaitlistModel = models.Waitlist || model<IWaitlist>('Waitlist', waitlistSchema);
