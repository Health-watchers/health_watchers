import { Schema, model, models } from 'mongoose';

export const notificationStatuses = [
  'PENDING',
  'PATIENTS_NOTIFIED',
  'HHS_NOTIFIED',
  'COMPLETE',
] as const;

export type NotificationStatus = (typeof notificationStatuses)[number];

export const breachSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type BreachSeverity = (typeof breachSeverities)[number];

export interface BreachIncident {
  discoveredAt: Date;
  affectedPatients: string[];
  description: string;
  severity: BreachSeverity;
  notificationStatus: NotificationStatus;
  notificationDeadline: Date;
  createdBy: string;
}

const breachIncidentSchema = new Schema<BreachIncident>(
  {
    discoveredAt: { type: Date, required: true, index: true },
    affectedPatients: { type: [String], required: true },
    description: { type: String, required: true },
    severity: { type: String, enum: breachSeverities, required: true, index: true },
    notificationStatus: {
      type: String,
      enum: notificationStatuses,
      default: 'PENDING',
      required: true,
      index: true,
    },
    notificationDeadline: { type: Date, required: true, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

breachIncidentSchema.index({ notificationDeadline: 1, notificationStatus: 1 });

export const BreachIncidentModel =
  models.BreachIncident || model<BreachIncident>('BreachIncident', breachIncidentSchema);
