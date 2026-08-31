/**
 * Rule evaluation engine for the customizable validation rules system.
 * Supports custom validator registration, versioning, conflict detection,
 * and a lightweight in-process testing framework.
 */

import type {
  CustomValidatorFn,
  RuleCondition,
  RuleConflict,
  RuleDefinition,
  RuleEvaluationResult,
  RuleSetEvaluationResult,
  RuleTestCase,
  RuleTestResult,
  RuleVersionEntry,
} from './types';

const customValidators = new Map<string, CustomValidatorFn>();

export function registerCustomValidator(name: string, fn: CustomValidatorFn): void {
  customValidators.set(name, fn);
}

export function unregisterCustomValidator(name: string): void {
  customValidators.delete(name);
}

function getField(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

function evaluateCondition(condition: RuleCondition, context: Record<string, unknown>): boolean {
  const fieldValue = getField(context, condition.field);

  switch (condition.operator) {
    case 'required':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
    case 'equals':
      return fieldValue === condition.value;
    case 'notEquals':
      return fieldValue !== condition.value;
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(condition.value));
    case 'notContains':
      return typeof fieldValue === 'string' && !fieldValue.includes(String(condition.value));
    case 'greaterThan':
      return typeof fieldValue === 'number' && fieldValue > Number(condition.value);
    case 'lessThan':
      return typeof fieldValue === 'number' && fieldValue < Number(condition.value);
    case 'between': {
      if (typeof fieldValue !== 'number' || !Array.isArray(condition.value)) return false;
      const [min, max] = condition.value as [number, number];
      return fieldValue >= min && fieldValue <= max;
    }
    case 'matches':
      return typeof fieldValue === 'string' && new RegExp(String(condition.value)).test(fieldValue);
    case 'custom': {
      const fn = condition.customFunctionName ? customValidators.get(condition.customFunctionName) : undefined;
      return fn ? fn(fieldValue, context) : false;
    }
    default:
      return false;
  }
}

/**
 * Evaluate a single rule against context. Target: sub-millisecond per rule
 * for the common case, keeping full rule sets well under the 50ms budget.
 */
export function evaluateRule(rule: RuleDefinition, context: Record<string, unknown>): RuleEvaluationResult {
  const start = performance.now();

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      passed: true,
      severity: rule.severity,
      durationMs: performance.now() - start,
    };
  }

  const outcomes = rule.conditions.map((condition) => evaluateCondition(condition, context));
  const passed = rule.matchMode === 'all' ? outcomes.every(Boolean) : outcomes.some(Boolean);

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    passed,
    severity: rule.severity,
    message: passed ? undefined : formatErrorMessage(rule, context),
    durationMs: performance.now() - start,
  };
}

/** Interpolates {{field}} tokens in a rule's error message with context values. */
export function formatErrorMessage(rule: RuleDefinition, context: Record<string, unknown>): string {
  return rule.errorMessage.replace(/\{\{(.*?)\}\}/g, (_, path: string) => {
    const value = getField(context, path.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

export function evaluateRuleSet(
  rules: RuleDefinition[],
  context: Record<string, unknown>
): RuleSetEvaluationResult {
  const start = performance.now();
  const results = rules.map((rule) => evaluateRule(rule, context));
  const conflicts = detectRuleConflicts(rules);

  return {
    passed: results.every((r) => r.passed || r.severity !== 'error'),
    results,
    totalDurationMs: performance.now() - start,
    conflicts,
  };
}

/**
 * Detects rules that contradict each other: same field, opposite equality
 * checks, both enabled. This is a heuristic pass, not exhaustive.
 */
export function detectRuleConflicts(rules: RuleDefinition[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (!a.enabled || !b.enabled) continue;

      for (const condA of a.conditions) {
        for (const condB of b.conditions) {
          if (
            condA.field === condB.field &&
            condA.operator === 'equals' &&
            condB.operator === 'equals' &&
            condA.value !== condB.value
          ) {
            conflicts.push({
              ruleAId: a.id,
              ruleBId: b.id,
              reason: `Both rules assert different equality on field "${condA.field}"`,
            });
          }
          if (
            condA.field === condB.field &&
            condA.operator === 'required' &&
            condB.operator === 'notContains' &&
            condB.value === ''
          ) {
            conflicts.push({
              ruleAId: a.id,
              ruleBId: b.id,
              reason: `Rule "${a.name}" requires "${condA.field}" while "${b.name}" forbids it`,
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function bumpRuleVersion(
  previous: RuleDefinition,
  updates: Partial<RuleDefinition>,
  changeNote?: string
): { definition: RuleDefinition; versionEntry: RuleVersionEntry } {
  const now = new Date().toISOString();
  const definition: RuleDefinition = {
    ...previous,
    ...updates,
    version: previous.version + 1,
    updatedAt: now,
  };

  return {
    definition,
    versionEntry: {
      version: definition.version,
      definition,
      changedAt: now,
      changeNote,
    },
  };
}

/** Lightweight test runner for validating rule behavior against fixtures. */
export function runRuleTests(rule: RuleDefinition, cases: RuleTestCase[]): RuleTestResult[] {
  return cases.map((testCase) => {
    const result = evaluateRule(rule, testCase.input);
    return {
      testCase: testCase.name,
      passed: result.passed === testCase.expectedPassed,
      expected: testCase.expectedPassed,
      actual: result.passed,
    };
  });
}

export function createEmptyRule(id: string, name: string): RuleDefinition {
  const now = new Date().toISOString();
  return {
    id,
    name,
    version: 1,
    severity: 'error',
    enabled: true,
    conditions: [],
    matchMode: 'all',
    errorMessage: `Validation failed for rule "${name}"`,
    createdAt: now,
    updatedAt: now,
  };
}
