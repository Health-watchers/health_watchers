export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'exists'
  | 'isEmpty';

export type FieldType = 'string' | 'number' | 'date' | 'boolean';

export type FilterCombinator = 'and' | 'or';

export interface FilterField {
  id: string;
  label: string;
  type: FieldType;
  path?: string;
  options?: string[];
  help?: string;
  defaultValue?: string;
}

export interface FilterRule {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value?: string | number | boolean;
  valueTo?: string | number;
}

export interface FilterGroup {
  id: string;
  combinator: FilterCombinator;
  rules: Array<FilterRule | FilterGroup>;
}

export interface SavedFilter {
  id: string;
  name: string;
  group: FilterGroup;
  createdAt: string;
  updatedAt: string;
  sharedBy?: string;
}

export interface FilterSuggestion {
  fieldId: string;
  operator: FilterOperator;
  value: string | number | boolean;
  label: string;
  description: string;
}

export interface FilterTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  group: FilterGroup;
}

export interface FilterSnapshot {
  version: number;
  savedAt: string;
  group: FilterGroup;
}

export const FILTER_SERIALIZATION_VERSION = 1;
export const FILTER_STORAGE_KEY = 'hw.savedFilters';
export const FILTER_HISTORY_KEY = 'hw.filterHistory';
export const MAX_SAVED_FILTERS = 50;
