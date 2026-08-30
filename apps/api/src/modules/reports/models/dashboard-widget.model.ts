/**
 * #1251 — Dashboard widget system.
 *
 * A dashboard is a named collection of widgets owned by a user within a
 * clinic. Each widget binds a template or custom query to a position and a
 * visualisation. Widget data is resolved on demand through the same query
 * compiler used everywhere else in the analytics engine.
 */

import { Schema, model, models } from 'mongoose';

export type WidgetVisualization = 'table' | 'bar' | 'line' | 'pie' | 'kpi';

export interface IDashboardWidget {
  /** Stable client-generated id, unique within the dashboard. */
  key: string;
  title: string;
  visualization: WidgetVisualization;
  templateId?: string;
  query?: Record<string, unknown>;
  /** Grid placement. */
  layout: { x: number; y: number; w: number; h: number };
  /** Rolling look-back window in days. */
  windowDays: number;
  /** Client cache hint in seconds. */
  refreshSeconds: number;
}

export interface IDashboard {
  clinicId: string;
  ownerId: string;
  name: string;
  /** Visible to the whole clinic vs. only the owner. */
  shared: boolean;
  widgets: IDashboardWidget[];
  createdAt?: Date;
  updatedAt?: Date;
}

const widgetSchema = new Schema<IDashboardWidget>(
  {
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    visualization: {
      type: String,
      enum: ['table', 'bar', 'line', 'pie', 'kpi'],
      default: 'bar',
    },
    templateId: { type: String },
    query: { type: Schema.Types.Mixed },
    layout: {
      x: { type: Number, default: 0, min: 0 },
      y: { type: Number, default: 0, min: 0 },
      w: { type: Number, default: 4, min: 1, max: 12 },
      h: { type: Number, default: 4, min: 1, max: 24 },
    },
    windowDays: { type: Number, default: 30, min: 1, max: 366 },
    refreshSeconds: { type: Number, default: 300, min: 30, max: 86400 },
  },
  { _id: false }
);

const dashboardSchema = new Schema<IDashboard>(
  {
    clinicId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    shared: { type: Boolean, default: false },
    widgets: { type: [widgetSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

dashboardSchema.index({ clinicId: 1, ownerId: 1 });
dashboardSchema.index({ clinicId: 1, shared: 1 });

export const DashboardModel = (models.Dashboard ||
  model<IDashboard>('Dashboard', dashboardSchema)) as import('mongoose').Model<IDashboard>;
