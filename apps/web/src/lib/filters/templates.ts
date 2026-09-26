import {
  type FilterGroup,
  type FilterOperator,
  type FilterRule,
  type FilterTemplate,
} from './types';
import { addRule, createGroup, createRule } from './engine';

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function yearsAgoDate(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function singleRuleValue(
  fieldId: string,
  operator: FilterOperator,
  value: string | number | boolean
): FilterRule {
  const rule = createRule(fieldId, operator);
  rule.value = value;
  return rule;
}

function orEquals(fieldId: string, values: Array<string | number | boolean>): FilterGroup {
  return values.reduce<FilterGroup>((group, value) => {
    return addRule(group, singleRuleValue(fieldId, 'equals', value));
  }, createGroup('or'));
}

function singleRule(
  fieldId: string,
  operator: FilterOperator,
  value: string | number | boolean
): FilterGroup {
  return addRule(createGroup('and'), singleRuleValue(fieldId, operator, value));
}

export const PRESET_FILTER_TEMPLATES: FilterTemplate[] = [
  {
    id: 'high-risk',
    name: 'High risk patients',
    description: 'Patients flagged high or critical clinical risk.',
    icon: '⚠️',
    group: orEquals('riskLevel', ['high', 'critical']),
  },
  {
    id: 'active',
    name: 'Active patients',
    description: 'All currently active patient records.',
    icon: '✅',
    group: (() => {
      const group = createGroup('and');
      const rule = singleRuleValue('isActive', 'equals', true);
      return addRule(group, rule);
    })(),
  },
  {
    id: 'recent-registrations',
    name: 'Registered in last 90 days',
    description: 'Patients onboarded within the past quarter.',
    icon: '🆕',
    group: singleRule('createdAt', 'gte', daysAgoDate(90)),
  },
  {
    id: 'over-40',
    name: 'Aged over 40',
    description: 'Patients born before today minus 40 years.',
    icon: '📅',
    group: singleRule('dateOfBirth', 'lte', yearsAgoDate(40)),
  },
  {
    id: 'needs-review',
    name: 'Low risk follow-up',
    description: 'Low risk patients that may need a scheduled follow-up.',
    icon: '🩺',
    group: singleRule('riskLevel', 'equals', 'low'),
  },
  {
    id: 'female-seniors',
    name: 'Female patients over 40',
    description: 'Female patients born before today minus 40 years.',
    icon: '👩',
    group: (() => {
      const root = createGroup('and');
      const sex = singleRuleValue('sex', 'equals', 'F');
      const dob = singleRuleValue('dateOfBirth', 'lte', yearsAgoDate(40));
      return addRule(addRule(root, sex), dob);
    })(),
  },
];

export function applyTemplate(template: FilterTemplate): FilterGroup {
  return JSON.parse(JSON.stringify(template.group)) as FilterGroup;
}
