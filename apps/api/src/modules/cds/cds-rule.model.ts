import { Schema, model, models } from 'mongoose';

export type RuleCategory = 'drug_interaction' | 'screening' | 'vital_sign' | 'care_gap' | 'allergy';
export type RuleTrigger = 'encounter_create' | 'prescription_add' | 'vital_sign_record';
export type AlertAction = 'alert' | 'recommendation' | 'block';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface CDSRule {
  ruleId: string;
  name: string;
  description: string;
  category: RuleCategory;
  trigger: RuleTrigger;
  conditions: Record<string, unknown>; // JSON rule definition
  action: {
    type: AlertAction;
    message: string;
    severity: AlertSeverity;
  };
  isActive: boolean;
  clinicId?: Schema.Types.ObjectId; // null = global rule
  createdAt: Date;
  updatedAt: Date;
}

export interface CDSAlert {
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  action: AlertAction;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: Schema.Types.ObjectId;
}

const cdsRuleSchema = new Schema<CDSRule>(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['drug_interaction', 'screening', 'vital_sign', 'care_gap', 'allergy'],
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ['encounter_create', 'prescription_add', 'vital_sign_record'],
      required: true,
    },
    conditions: { type: Schema.Types.Mixed, required: true },
    action: {
      type: {
        type: String,
        enum: ['alert', 'recommendation', 'block'],
        required: true,
      },
      message: { type: String, required: true },
      severity: {
        type: String,
        enum: ['info', 'warning', 'critical'],
        required: true,
      },
    },
    isActive: { type: Boolean, default: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', index: true },
  },
  { timestamps: true, versionKey: false }
);

export const CDSRuleModel = models.CDSRule || model<CDSRule>('CDSRule', cdsRuleSchema);
