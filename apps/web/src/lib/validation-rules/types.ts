/**
 * Type definitions for the customizable validation rules system.
 */

export type RuleSeverity = 'error' | 'warning' | 'info';

export type RuleOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'matches'
  | 'required'
  | 'custom';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value?: unknown;
  customFunctionName?: string;
}

export interface RuleDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  severity: RuleSeverity;
  enabled: boolean;
  conditions: RuleCondition[];
  /** All conditions must pass ('all') or any single one ('any') */
  matchMode: 'all' | 'any';
  errorMessage: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleVersionEntry {
  version: number;
  definition: RuleDefinition;
  changedAt: string;
  changedBy?: string;
  changeNote?: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: RuleSeverity;
  message?: string;
  durationMs: number;
}

export interface RuleSetEvaluationResult {
  passed: boolean;
  results: RuleEvaluationResult[];
  totalDurationMs: number;
  conflicts: RuleConflict[];
}

export interface RuleConflict {
  ruleAId: string;
  ruleBId: string;
  reason: string;
}

export type CustomValidatorFn = (value: unknown, context: Record<string, unknown>) => boolean;

export interface RuleTestCase {
  name: string;
  input: Record<string, unknown>;
  expectedPassed: boolean;
}

export interface RuleTestResult {
  testCase: string;
  passed: boolean;
  expected: boolean;
  actual: boolean;
}
