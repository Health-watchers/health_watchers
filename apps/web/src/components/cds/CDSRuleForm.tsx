'use client';

import { useMemo, useState } from 'react';
import type { CDSRule, RuleCategory, RuleTrigger, AlertAction, AlertSeverity } from '@/types/cds';

interface CDSRuleFormProps {
  initialRule?: CDSRule;
  onSubmit: (rule: Omit<CDSRule, 'createdAt' | 'updatedAt'> | Partial<CDSRule>) => void;
  onCancel: () => void;
  isLoading: boolean;
  existingRules?: CDSRule[];
  canCreate?: boolean;
}

type LogicalOperator = 'AND' | 'OR';
type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

interface ConditionRow {
  id: string;
  field: string;
  operator: ComparisonOperator;
  value: string;
}

interface ConditionGroup {
  id: string;
  logic: LogicalOperator;
  rows: ConditionRow[];
}

const comparisonOperators: { value: ComparisonOperator; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists' },
];

let conditionIdCounter = 0;
function nextConditionId(prefix: string): string {
  conditionIdCounter += 1;
  return `${prefix}_${Date.now()}_${conditionIdCounter}`;
}

function coerceValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

function buildConditionsFromGroups(groups: ConditionGroup[]): Record<string, unknown> {
  const groupObjects = groups
    .map((group) => {
      const entries = group.rows
        .filter((row) => row.field.trim() !== '')
        .map((row) => ({
          field: row.field.trim(),
          operator: row.operator,
          value: coerceValue(row.value),
        }));
      if (entries.length === 0) return null;
      return { logic: group.logic, conditions: entries };
    })
    .filter((group): group is { logic: LogicalOperator; conditions: unknown[] } => group !== null);

  if (groupObjects.length === 0) return {};
  if (groupObjects.length === 1) return groupObjects[0] as unknown as Record<string, unknown>;
  return { logic: 'AND', groups: groupObjects };
}

function groupsFromConditions(conditions: Record<string, unknown> | undefined): ConditionGroup[] {
  const defaultGroup = (): ConditionGroup => ({
    id: nextConditionId('group'),
    logic: 'AND',
    rows: [{ id: nextConditionId('row'), field: '', operator: 'eq', value: '' }],
  });

  if (!conditions || Object.keys(conditions).length === 0) return [defaultGroup()];

  const toRow = (entry: unknown): ConditionRow | null => {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.field !== 'string') return null;
    const operator = (obj.operator as ComparisonOperator) || 'eq';
    const value = obj.value === undefined || obj.value === null ? '' : String(obj.value);
    return { id: nextConditionId('row'), field: obj.field, operator, value };
  };

  const toGroup = (raw: unknown): ConditionGroup | null => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const logic = obj.logic === 'OR' ? 'OR' : 'AND';
    const entries = Array.isArray(obj.conditions) ? obj.conditions : [];
    const rows = entries
      .map(toRow)
      .filter((row): row is ConditionRow => row !== null);
    if (rows.length === 0) return null;
    return { id: nextConditionId('group'), logic, rows };
  };

  if (Array.isArray((conditions as Record<string, unknown>).groups)) {
    const groups = ((conditions as Record<string, unknown>).groups as unknown[])
      .map(toGroup)
      .filter((group): group is ConditionGroup => group !== null);
    if (groups.length > 0) return groups;
  }

  const single = toGroup(conditions);
  if (single) return [single];

  return [defaultGroup()];
}

function ruleSignature(rule: {
  trigger?: RuleTrigger;
  category?: RuleCategory;
  conditions?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    trigger: rule.trigger ?? null,
    category: rule.category ?? null,
    conditions: rule.conditions ?? {},
  });
}

const categories: RuleCategory[] = [
  'drug_interaction',
  'screening',
  'vital_sign',
  'care_gap',
  'allergy',
];
const triggers: RuleTrigger[] = ['encounter_create', 'prescription_add', 'vital_sign_record'];
const actions: AlertAction[] = ['alert', 'recommendation', 'block'];
const severities: AlertSeverity[] = ['info', 'warning', 'critical'];

export function CDSRuleForm({
  initialRule,
  onSubmit,
  onCancel,
  isLoading,
  existingRules = [],
  canCreate = true,
}: CDSRuleFormProps) {
  const [formData, setFormData] = useState({
    ruleId: initialRule?.ruleId || `rule_${Date.now()}`,
    name: initialRule?.name || '',
    description: initialRule?.description || '',
    category: (initialRule?.category || 'vital_sign') as RuleCategory,
    trigger: (initialRule?.trigger || 'encounter_create') as RuleTrigger,
    conditions: initialRule?.conditions || {},
    action: initialRule?.action || {
      type: 'alert' as AlertAction,
      message: '',
      severity: 'warning' as AlertSeverity,
    },
    isActive: initialRule?.isActive ?? true,
  });

  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>(() =>
    groupsFromConditions(initialRule?.conditions)
  );
  const [useRawJson, setUseRawJson] = useState(false);
  const [conditionsJson, setConditionsJson] = useState(
    JSON.stringify(initialRule?.conditions || {}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const addGroup = () => {
    setConditionGroups((prev) => [
      ...prev,
      {
        id: nextConditionId('group'),
        logic: 'AND',
        rows: [{ id: nextConditionId('row'), field: '', operator: 'eq', value: '' }],
      },
    ]);
  };

  const removeGroup = (groupId: string) => {
    setConditionGroups((prev) => {
      const next = prev.filter((group) => group.id !== groupId);
      return next.length > 0
        ? next
        : [
            {
              id: nextConditionId('group'),
              logic: 'AND',
              rows: [{ id: nextConditionId('row'), field: '', operator: 'eq', value: '' }],
            },
          ];
    });
  };

  const updateGroupLogic = (groupId: string, logic: LogicalOperator) => {
    setConditionGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, logic } : group))
    );
  };

  const addRow = (groupId: string) => {
    setConditionGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rows: [
                ...group.rows,
                { id: nextConditionId('row'), field: '', operator: 'eq', value: '' },
              ],
            }
          : group
      )
    );
  };

  const removeRow = (groupId: string, rowId: string) => {
    setConditionGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.filter((row) => row.id !== rowId);
        return {
          ...group,
          rows:
            rows.length > 0
              ? rows
              : [{ id: nextConditionId('row'), field: '', operator: 'eq', value: '' }],
        };
      })
    );
  };

  const updateRow = (groupId: string, rowId: string, patch: Partial<ConditionRow>) => {
    setConditionGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rows: group.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : group
      )
    );
  };

  const resolvedConditions = useMemo<Record<string, unknown>>(() => {
    if (useRawJson) {
      try {
        return JSON.parse(conditionsJson) as Record<string, unknown>;
      } catch {
        return formData.conditions;
      }
    }
    return buildConditionsFromGroups(conditionGroups);
  }, [useRawJson, conditionsJson, conditionGroups, formData.conditions]);

  const conflicts = useMemo(() => {
    const signature = ruleSignature({
      trigger: formData.trigger,
      category: formData.category,
      conditions: resolvedConditions,
    });
    return existingRules.filter((rule) => {
      if (rule.ruleId === formData.ruleId) return false;
      if (!rule.isActive) return false;
      return (
        ruleSignature({
          trigger: rule.trigger,
          category: rule.category,
          conditions: rule.conditions,
        }) === signature
      );
    });
  }, [existingRules, formData.trigger, formData.category, formData.ruleId, resolvedConditions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (useRawJson) {
      try {
        const conditions = JSON.parse(conditionsJson);
        setJsonError(null);
        onSubmit({
          ...formData,
          conditions,
        });
      } catch (error) {
        setJsonError('Invalid JSON in conditions');
      }
      return;
    }
    onSubmit({
      ...formData,
      conditions: resolvedConditions,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6"
    >
      {!canCreate && (
        <div
          role="status"
          className="rounded-md border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-700"
        >
          You do not have permission to create or edit clinical decision support rules. Only users
          with the <span className="font-medium">admin</span> or{' '}
          <span className="font-medium">medical_director</span> role may modify rules. This form is
          read-only.
        </div>
      )}

      {conflicts.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <p className="font-medium">Potential rule conflict detected</p>
          <p className="mt-1">
            The following active rule(s) share the same trigger, category and conditions and may
            fire for the same condition:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((rule) => (
              <li key={rule.ruleId}>
                {rule.name} ({rule.ruleId})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Rule ID</label>
          <input
            type="text"
            value={formData.ruleId}
            onChange={(e) => setFormData({ ...formData, ruleId: e.target.value })}
            disabled={!!initialRule}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
          rows={3}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Category</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as RuleCategory })}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Trigger</label>
          <select
            value={formData.trigger}
            onChange={(e) => setFormData({ ...formData, trigger: e.target.value as RuleTrigger })}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {triggers.map((trig) => (
              <option key={trig} value={trig}>
                {trig.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-neutral-700">Conditions</label>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={useRawJson}
              onChange={(e) => {
                const next = e.target.checked;
                if (next) {
                  setConditionsJson(JSON.stringify(resolvedConditions, null, 2));
                } else {
                  setConditionGroups(groupsFromConditions(resolvedConditions));
                }
                setJsonError(null);
                setUseRawJson(next);
              }}
              className="rounded border-neutral-300"
            />
            Advanced (raw JSON)
          </label>
        </div>

        {useRawJson ? (
          <div>
            <textarea
              value={conditionsJson}
              onChange={(e) => {
                setConditionsJson(e.target.value);
                setJsonError(null);
              }}
              rows={6}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
            />
            {jsonError && <p className="mt-1 text-xs text-red-600">{jsonError}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              Define rule conditions as JSON. Example: {'{'}type: "vital_sign", bloodPressure:{' '}
              {'{'}critical: true{'}'}
              {'}'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conditionGroups.map((group, groupIndex) => (
              <div
                key={group.id}
                className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-neutral-700">Group {groupIndex + 1}</span>
                    <span className="text-neutral-500">match</span>
                    <select
                      value={group.logic}
                      onChange={(e) =>
                        updateGroupLogic(group.id, e.target.value as LogicalOperator)
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="AND">ALL (AND)</option>
                      <option value="OR">ANY (OR)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Remove group
                  </button>
                </div>

                <div className="space-y-2">
                  {group.rows.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={row.field}
                        onChange={(e) => updateRow(group.id, row.id, { field: e.target.value })}
                        placeholder="field (e.g. bloodPressure.systolic)"
                        className="min-w-[10rem] flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <select
                        value={row.operator}
                        onChange={(e) =>
                          updateRow(group.id, row.id, {
                            operator: e.target.value as ComparisonOperator,
                          })
                        }
                        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      >
                        {comparisonOperators.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateRow(group.id, row.id, { value: e.target.value })}
                        placeholder="value"
                        disabled={row.operator === 'exists'}
                        className="min-w-[6rem] flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(group.id, row.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                        aria-label="Remove condition"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addRow(group.id)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  + Add condition
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addGroup}
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              + Add group
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-md bg-neutral-50 p-4">
        <h3 className="font-medium text-neutral-900">Action</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Type</label>
            <select
              value={formData.action.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  action: { ...formData.action, type: e.target.value as AlertAction },
                })
              }
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {actions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Severity</label>
            <select
              value={formData.action.severity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  action: { ...formData.action, severity: e.target.value as AlertSeverity },
                })
              }
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {severities.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Message</label>
          <textarea
            value={formData.action.message}
            onChange={(e) =>
              setFormData({
                ...formData,
                action: { ...formData.action, message: e.target.value },
              })
            }
            required
            rows={3}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="rounded border-neutral-300"
        />
        <label htmlFor="isActive" className="text-sm font-medium text-neutral-700">
          Active
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading || !canCreate}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving…' : 'Save Rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
