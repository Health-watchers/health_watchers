import { Schema, Types, model, models } from 'mongoose';

/**
 * Audit log of medication safety checks (Issue #1244). Every check is
 * recorded (PHI-safe — only resolved generic names, never free text) so
 * interaction analytics can report volumes, severities, and alert accuracy.
 */
export interface InteractionCheckLog {
  clinicId?: Types.ObjectId;
  patientId?: Types.ObjectId;
  userId?: Types.ObjectId;
  medications: string[]; // resolved generic names
  unresolvedMedications: string[]; // free text that could not be resolved
  allergiesChecked: number;
  includeFood: boolean;
  severity: 'critical' | 'major' | 'moderate' | 'minor' | 'none';
  drugDrugCount: number;
  allergyCount: number;
  foodCount: number;
  durationMs: number;
  cacheHit: boolean;
  source: 'engine' | 'database' | 'llm';
  timestamp: Date;
}

const interactionCheckLogSchema = new Schema<InteractionCheckLog>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: false, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: false, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    medications: { type: [String], default: [] },
    unresolvedMedications: { type: [String], default: [] },
    allergiesChecked: { type: Number, default: 0 },
    includeFood: { type: Boolean, default: false },
    severity: {
      type: String,
      enum: ['critical', 'major', 'moderate', 'minor', 'none'],
      required: true,
      index: true,
    },
    drugDrugCount: { type: Number, default: 0 },
    allergyCount: { type: Number, default: 0 },
    foodCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    cacheHit: { type: Boolean, default: false },
    source: { type: String, enum: ['engine', 'database', 'llm'], default: 'engine' },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
  },
  { timestamps: true, versionKey: false, collection: 'interaction_check_logs' }
);

interactionCheckLogSchema.index({ timestamp: -1 });
interactionCheckLogSchema.index({ severity: 1, timestamp: -1 });

export const InteractionCheckLogModel = (models.InteractionCheckLog ||
  model<InteractionCheckLog>(
    'InteractionCheckLog',
    interactionCheckLogSchema
  )) as import('mongoose').Model<InteractionCheckLog>;
