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
  conditions: Record<string, unknown>;
  action: {
    type: AlertAction;
    message: string;
    severity: AlertSeverity;
  };
  isActive: boolean;
  clinicId?: string;
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
  acknowledgedBy?: string;
}
