/**
 * #1251 — Report export & scheduling.
 *
 * A saved schedule references either a predefined template or an inline
 * custom query definition, a cadence, and a delivery target. The
 * `report-schedule-job` worker picks up due schedules, runs the query and
 * records a run in {@link ReportRunModel}.
 */

import { Schema, model, models, Types } from 'mongoose';

export type ScheduleCadence = 'daily' | 'weekly' | 'monthly';
export type ExportFormat = 'json' | 'csv';

export interface IReportSchedule {
  clinicId: string;
  name: string;
  /** Exactly one of templateId / query is set. */
  templateId?: string;
  query?: Record<string, unknown>;
  cadence: ScheduleCadence;
  /** Hour of day (UTC, 0-23) the report should run. */
  hourUtc: number;
  /** Rolling look-back window in days applied as from/to at run time. */
  windowDays: number;
  format: ExportFormat;
  /** Notification recipients (email addresses / user ids). */
  recipients: string[];
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const reportScheduleSchema = new Schema<IReportSchedule>(
  {
    clinicId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    templateId: { type: String },
    query: { type: Schema.Types.Mixed },
    cadence: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    hourUtc: { type: Number, min: 0, max: 23, default: 6 },
    windowDays: { type: Number, min: 1, max: 366, default: 30 },
    format: { type: String, enum: ['json', 'csv'], default: 'json' },
    recipients: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date, required: true, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

reportScheduleSchema.index({ isActive: 1, nextRunAt: 1 });

export interface IReportRun {
  scheduleId: Types.ObjectId;
  clinicId: string;
  status: 'success' | 'error';
  rowCount: number;
  elapsedMs: number;
  window: { from: Date; to: Date };
  error?: string;
  createdAt?: Date;
}

const reportRunSchema = new Schema<IReportRun>(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'ReportSchedule', required: true, index: true },
    clinicId: { type: String, required: true, index: true },
    status: { type: String, enum: ['success', 'error'], required: true },
    rowCount: { type: Number, default: 0 },
    elapsedMs: { type: Number, default: 0 },
    window: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

reportRunSchema.index({ scheduleId: 1, createdAt: -1 });
// Keep run history bounded — expire individual runs after 90 days.
reportRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ReportScheduleModel = (models.ReportSchedule ||
  model<IReportSchedule>(
    'ReportSchedule',
    reportScheduleSchema
  )) as import('mongoose').Model<IReportSchedule>;

export const ReportRunModel = (models.ReportRun ||
  model<IReportRun>('ReportRun', reportRunSchema)) as import('mongoose').Model<IReportRun>;

/**
 * Compute the next run timestamp for a cadence, strictly after `after`.
 */
export function computeNextRun(
  cadence: ScheduleCadence,
  hourUtc: number,
  after: Date = new Date()
): Date {
  const next = new Date(after);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hourUtc);
  if (next <= after) {
    if (cadence === 'daily') next.setUTCDate(next.getUTCDate() + 1);
    if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
    if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  }
  // For weekly/monthly, if the first candidate is still <= after (e.g. hour
  // already passed today for a weekly schedule) advance one more period.
  while (next <= after) {
    if (cadence === 'daily') next.setUTCDate(next.getUTCDate() + 1);
    else if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}
