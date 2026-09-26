'use client';

import { useMemo, useRef, useState } from 'react';
import {
  type FilterField,
  type FilterGroup,
  type FilterOperator,
  type FilterRule,
} from '@/lib/filters/types';
import {
  addGroup,
  addRule,
  createGroup,
  createRule,
  describeGroup,
  isEmptyGroup,
  pruneEmptyGroups,
  ruleCount,
  toggleCombinator,
} from '@/lib/filters/engine';
import { PRESET_FILTER_TEMPLATES, applyTemplate } from '@/lib/filters/templates';
import { buildSuggestions, type RecordLike } from '@/lib/filters/suggestions';
import { deleteSavedFilter, listSavedFilters, saveFilter } from '@/lib/filters/persistence';
import { toCsv, toJson, toShareUrl, importFromJson } from '@/lib/filters/export';

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'equals',
  notEquals: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  exists: 'is set',
  isEmpty: 'is empty',
};

const STRING_OPERATORS: FilterOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'exists',
  'isEmpty',
];
const NUMBER_OPERATORS: FilterOperator[] = [
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'exists',
  'isEmpty',
];
const DATE_OPERATORS: FilterOperator[] = [
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'exists',
  'isEmpty',
];
const BOOLEAN_OPERATORS: FilterOperator[] = ['equals', 'notEquals', 'exists', 'isEmpty'];

function operatorsForType(type: FilterField['type']): FilterOperator[] {
  switch (type) {
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'boolean':
      return BOOLEAN_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

function baseClass(extra = ''): string {
  return [
    'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700',
    'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
    'dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-primary-900/50',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function groupNodeClassName(): string {
  return 'rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60';
}

function neutralChipClass(active = false): string {
  if (active) {
    return 'rounded-md bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200';
  }
  return 'rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300';
}

function toolButtonClass(): string {
  return 'rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700';
}

function RuleValueInput({
  field,
  rule,
  onChange,
}: {
  field: FilterField;
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
}) {
  const setValue = (value: string | number | boolean) => {
    onChange({ ...rule, value });
  };

  if (rule.operator === 'exists' || rule.operator === 'isEmpty') {
    return <div className="flex-1" aria-hidden="true" />;
  }

  if (rule.operator === 'between') {
    return (
      <div className="flex flex-1 gap-2">
        <input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          className={baseClass()}
          value={rule.value == null ? '' : String(rule.value)}
          onChange={(e) => setValue(e.target.value)}
          placeholder="From"
          aria-label={`From value for ${field.label}`}
        />
        <input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          className={baseClass()}
          value={rule.valueTo == null ? '' : String(rule.valueTo)}
          onChange={(e) => onChange({ ...rule, valueTo: e.target.value })}
          placeholder="To"
          aria-label={`To value for ${field.label}`}
        />
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <select
        className={baseClass('flex-1')}
        value={rule.value == null ? 'true' : String(rule.value)}
        onChange={(e) => setValue(e.target.value === 'true')}
        aria-label={`Value for ${field.label}`}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <select
        className={baseClass('flex-1')}
        value={rule.value == null ? '' : String(rule.value)}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Value for ${field.label}`}
      >
        <option value="">Select…</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
      className={baseClass('flex-1')}
      value={rule.value == null ? '' : String(rule.value)}
      onChange={(e) => setValue(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      placeholder={field.help ?? 'Value'}
      aria-label={`Value for ${field.label}`}
    />
  );
}

function RuleRow({
  fields,
  rule,
  onUpdate,
  onRemove,
}: {
  fields: FilterField[];
  rule: FilterRule;
  onUpdate: (ruleId: string, patch: Partial<FilterRule>) => void;
  onRemove: (ruleId: string) => void;
}) {
  const field = fields.find((f) => f.id === rule.fieldId) ?? fields[0];
  const operators = field ? operatorsForType(field.type) : STRING_OPERATORS;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="block flex-1" title={field?.help}>
        <span className="sr-only">Filter field</span>
        <select
          className={baseClass()}
          value={rule.fieldId}
          onChange={(e) => {
            const next = fields.find((f) => f.id === e.target.value);
            const op = next ? operatorsForType(next.type)[0] : 'equals';
            onUpdate(rule.id, {
              fieldId: e.target.value,
              operator: op,
              value: undefined,
              valueTo: undefined,
            });
          }}
          aria-label="Filter field"
        >
          {fields.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
      <select
        className={baseClass('flex-1')}
        value={rule.operator}
        onChange={(e) => onUpdate(rule.id, { operator: e.target.value as FilterOperator })}
        aria-label={`Operator for ${field?.label}`}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {field && (
        <RuleValueInput field={field} rule={rule} onChange={(next) => onUpdate(rule.id, next)} />
      )}
      <button
        type="button"
        onClick={() => onRemove(rule.id)}
        className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-700"
        aria-label="Remove rule"
      >
        ✕
      </button>
    </div>
  );
}

function GroupNode({
  fields,
  group,
  root,
  onChange,
}: {
  fields: FilterField[];
  group: FilterGroup;
  root: FilterGroup;
  onChange: (group: FilterGroup) => void;
}) {
  const patchBranch = (node: FilterGroup, branch: FilterGroup): FilterGroup => {
    if (node.id === branch.id) return node;
    if (branch.rules.some((child) => child.id === node.id)) {
      return {
        ...branch,
        rules: branch.rules.map((child) => (child.id === node.id ? node : child)),
      };
    }
    return {
      ...branch,
      rules: branch.rules.map((child) => ('rules' in child ? patchBranch(node, child) : child)),
    };
  };

  const updateSelf = (next: FilterGroup) => onChange(patchBranch(next, root));

  const updateChildRule = (ruleId: string, patch: Partial<FilterRule>) => {
    onChange(updateRuleInBranch(root, ruleId, patch));
  };

  const updateRuleInBranch = (
    branch: FilterGroup,
    ruleId: string,
    patch: Partial<FilterRule>
  ): FilterGroup => {
    if (branch.rules.some((node) => !('rules' in node) && node.id === ruleId)) {
      return {
        ...branch,
        rules: branch.rules.map((node) =>
          !('rules' in node) && node.id === ruleId ? { ...node, ...patch } : node
        ),
      };
    }
    return {
      ...branch,
      rules: branch.rules.map((node) =>
        'rules' in node ? updateRuleInBranch(node, ruleId, patch) : node
      ),
    };
  };

  const removeChild = (nodeId: string) => {
    onChange(removeNodeFrom(root, nodeId));
  };

  const removeNodeFrom = (branch: FilterGroup, nodeId: string): FilterGroup => {
    if (branch.rules.some((node) => node.id === nodeId)) {
      return { ...branch, rules: branch.rules.filter((node) => node.id !== nodeId) };
    }
    return {
      ...branch,
      rules: branch.rules.map((node) => ('rules' in node ? removeNodeFrom(node, nodeId) : node)),
    };
  };

  const addRuleHere = () => {
    updateSelf(addRule(group, createRule(fields[0]?.id ?? '', 'equals')));
  };

  const addGroupHere = () => {
    updateSelf(addGroup(group, createGroup('and')));
  };

  return (
    <div className={groupNodeClassName()}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => updateSelf(toggleCombinator(group))}
          className={
            group.combinator === 'and'
              ? 'rounded-md bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
              : 'rounded-md bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          }
          title="Toggle between matching all rules (AND) or any rule (OR)"
        >
          {group.combinator === 'and' ? 'Match all (AND)' : 'Match any (OR)'}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={addRuleHere}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            + Rule
          </button>
          <button
            type="button"
            onClick={addGroupHere}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            + Group
          </button>
          <button
            type="button"
            onClick={() => removeChild(group.id)}
            className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-700"
            aria-label="Remove group"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {group.rules.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No rules yet — add a rule or group.
          </p>
        )}
        {group.rules.map((node) =>
          'rules' in node ? (
            <GroupNode key={node.id} fields={fields} group={node} root={root} onChange={onChange} />
          ) : (
            <RuleRow
              key={node.id}
              fields={fields}
              rule={node}
              onUpdate={updateChildRule}
              onRemove={(ruleId) => removeChild(ruleId)}
            />
          )
        )}
      </div>
    </div>
  );
}

interface FilterBuilderProps {
  fields: FilterField[];
  records: RecordLike[];
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
  title?: string;
}

export default function FilterBuilder({
  fields,
  records,
  group,
  onChange,
  title = 'Advanced filter builder',
}: FilterBuilderProps) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [namingFilter, setNamingFilter] = useState(false);
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savedFilters = useMemo(() => listSavedFilters(), [showSaved, group]);
  const suggestions = useMemo(() => buildSuggestions(records, fields, 6), [records, fields]);
  const counts = ruleCount(group);
  const active = !isEmptyGroup(group);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  };

  const applyTemplateAction = (templateId: string) => {
    const template = PRESET_FILTER_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      onChange(applyTemplate(template));
      notify(`Template "${template.name}" applied`);
    }
    setShowTemplates(false);
  };

  const handleSaveFilter = () => {
    const name = newFilterName.trim() || 'Untitled filter';
    saveFilter(name, group);
    setNewFilterName('');
    setNamingFilter(false);
    notify('Filter saved');
  };

  const handleShare = async () => {
    const url = toShareUrl({ group, name: title });
    try {
      await navigator.clipboard.writeText(url);
      notify('Share link copied to clipboard');
    } catch {
      notify(url);
    }
  };

  const download = (filename: string, content: string, mime = 'application/json') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    download(`filter-${Date.now()}.json`, toJson({ group, name: title }));
    notify('Filter exported as JSON');
  };

  const handleExportCsv = () => {
    if (records.length === 0) {
      notify('No records to export');
      return;
    }
    download(
      `filter-results-${Date.now()}.csv`,
      toCsv(records as Array<Record<string, unknown>>, group, fields),
      'text/csv'
    );
    notify('Filtered results exported as CSV');
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importFromJson(String(reader.result ?? ''), () =>
        notify('Could not import filter')
      );
      if (imported) {
        onChange(imported);
        notify('Filter imported');
      }
    };
    reader.readAsText(file);
  };

  const applySuggestion = (
    fieldId: string,
    operator: FilterOperator,
    value: string | number | boolean
  ) => {
    const rule = createRule(fieldId, operator);
    rule.value = value;
    onChange(pruneEmptyGroups(addRule(group, rule)));
    setShowSuggestions(false);
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className={toolButtonClass()}
            aria-expanded={showHelp}
          >
            ❓ Help
          </button>
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            className={toolButtonClass()}
          >
            💡 Suggestions
          </button>
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className={toolButtonClass()}
          >
            🧩 Templates
          </button>
          <button
            type="button"
            onClick={() => setShowSaved((v) => !v)}
            className={toolButtonClass()}
          >
            💾 Saved
          </button>
          <button
            type="button"
            onClick={() => {
              setNamingFilter(true);
              setShowSaved(false);
            }}
            className={toolButtonClass()}
          >
            Save current
          </button>
          <button
            type="button"
            onClick={handleShare}
            title="Copy a shareable link for this filter"
            className={toolButtonClass()}
          >
            🔗 Share
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={toolButtonClass()}
          >
            📥 Import
          </button>
          <button type="button" onClick={handleExportJson} className={toolButtonClass()}>
            📤 Export
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className={toolButtonClass()}
            title="Export the current result set as CSV"
          >
            🗒️ CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => setShowBuilder((v) => !v)}
            className="bg-primary-600 hover:bg-primary-700 rounded-md px-3 py-1.5 text-xs font-medium text-white"
            aria-expanded={showBuilder}
          >
            {showBuilder ? 'Hide builder' : 'Open builder'}
            {counts > 0 ? ` (${counts}${counts === 1 ? ' rule' : ' rules'})` : ''}
          </button>
          {active && (
            <button
              type="button"
              onClick={() => onChange(createGroup('and'))}
              className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {toast && (
        <p role="status" className={neutralChipClass() + ' mb-2 w-fit'}>
          {toast}
        </p>
      )}

      {showHelp && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="mb-2 font-semibold">How it works</p>
          <p className="mb-2">
            Build compound queries with nested groups. A group matches <strong>all</strong> (AND) or{' '}
            <strong>any</strong> (OR) of its rules. Groups can be nested inside groups for arbitrary
            Boolean logic such as <em>(risk is high OR risk is critical) AND (age over 40)</em>.
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>+ Rule</strong> adds a comparison condition.
            </li>
            <li>
              <strong>+ Group</strong> adds a nested group for complex logic.
            </li>
            <li>
              <strong>Save current</strong> persists the filter in your browser.
            </li>
            <li>
              <strong>Templates</strong> apply a ready-made query.
            </li>
            <li>
              <strong>Share</strong> copies a link someone else can open to load the same filter.
            </li>
            <li>
              <strong>Suggestions</strong> propose common conditions derived from your data.
            </li>
          </ul>
        </div>
      )}

      {showSuggestions && (
        <div className="mb-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            Suggested conditions
          </p>
          {suggestions.length === 0 ? (
            <p className="text-xs text-neutral-500">No suggestions available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.fieldId}-${String(suggestion.value)}`}
                  type="button"
                  onClick={() =>
                    applySuggestion(suggestion.fieldId, suggestion.operator, suggestion.value)
                  }
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  title={suggestion.description}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showTemplates && (
        <div className="mb-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            Filter templates
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESET_FILTER_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplateAction(template.id)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-left text-xs hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
              >
                <span className="mr-1">{template.icon}</span>
                <span className="font-medium">{template.name}</span>
                <span className="block text-neutral-500 dark:text-neutral-400">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSaved && (
        <div className="mb-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            Saved filters
          </p>
          {savedFilters.length === 0 ? (
            <p className="text-xs text-neutral-500">No saved filters yet.</p>
          ) : (
            <ul className="space-y-1">
              {savedFilters.map((saved) => (
                <li
                  key={saved.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  <button
                    type="button"
                    onClick={() => onChange(saved.group)}
                    className="text-left text-xs text-neutral-700 dark:text-neutral-200"
                    title={describeGroup(saved.group, fields)}
                  >
                    {saved.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSavedFilter(saved.id);
                      notify('Filter deleted');
                    }}
                    className="text-xs text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label={`Delete ${saved.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {namingFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <input
            type="text"
            value={newFilterName}
            onChange={(e) => setNewFilterName(e.target.value)}
            placeholder="Filter name"
            className={baseClass('max-w-xs flex-1')}
            aria-label="Filter name"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveFilter}
            className="bg-primary-600 hover:bg-primary-700 rounded-md px-3 py-2 text-xs font-medium text-white"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setNamingFilter(false)}
            className="rounded-md px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      )}

      {showBuilder && (
        <div className="space-y-2">
          <GroupNode fields={fields} group={group} root={group} onChange={onChange} />
        </div>
      )}

      {!showBuilder && active && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100">
          Active filter: {describeGroup(group, fields)}
        </p>
      )}
    </div>
  );
}
