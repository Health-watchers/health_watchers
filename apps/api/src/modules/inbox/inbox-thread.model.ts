import { Schema, Types, model, models } from 'mongoose';

/**
 * Care-team workflow state for a portal message thread.
 *
 * Portal messages themselves live in PortalMessage (grouped by threadId); this collection only
 * stores what the clinician inbox layers on top: who owns the thread, how urgent it is, and
 * whether it is closed. A thread with no document here is treated as open / normal / unassigned.
 */
export type InboxThreadStatus = 'open' | 'closed';
export type InboxThreadPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface IInboxThread {
  clinicId: Types.ObjectId;
  threadId: Types.ObjectId;
  patientId: Types.ObjectId;
  assigneeId?: Types.ObjectId | null;
  priority: InboxThreadPriority;
  status: InboxThreadStatus;
  closedAt?: Date | null;
  closedBy?: Types.ObjectId | null;
}

const inboxThreadSchema = new Schema<IInboxThread>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    threadId: { type: Schema.Types.ObjectId, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

inboxThreadSchema.index({ clinicId: 1, threadId: 1 }, { unique: true });
inboxThreadSchema.index({ clinicId: 1, status: 1, assigneeId: 1 });

export const InboxThreadModel = (models.InboxThread ||
  model<IInboxThread>('InboxThread', inboxThreadSchema)) as import('mongoose').Model<IInboxThread>;
