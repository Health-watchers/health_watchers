'use client';

import { useState } from 'react';
import type { CDSRule, RuleCategory, RuleTrigger, AlertAction, AlertSeverity } from '@/types/cds';

interface CDSRuleFormProps {
  initialRule?: CDSRule;
  onSubmit: (rule: Omit<CDSRule, 'createdAt' | 'updatedAt'> | Partial<CDSRule>) => void;
  onCancel: () => void;
  isLoading: boolean;
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

export function CDSRuleForm({ initialRule, onSubmit, onCancel, isLoading }: CDSRuleFormProps) {
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

  const [conditionsJson, setConditionsJson] = useState(
    JSON.stringify(formData.conditions, null, 2)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const conditions = JSON.parse(conditionsJson);
      onSubmit({
        ...formData,
        conditions,
      });
    } catch (error) {
      alert('Invalid JSON in conditions');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6"
    >
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

      <div>
        <label className="block text-sm font-medium text-neutral-700">Conditions (JSON)</label>
        <textarea
          value={conditionsJson}
          onChange={(e) => setConditionsJson(e.target.value)}
          required
          rows={6}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm text-xs"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Define rule conditions as JSON. Example: {'{'}type: "vital_sign", bloodPressure: {'{'}
          critical: true{'}'}
        </p>
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
          disabled={isLoading}
          className="bg-primary-600 hover:bg-primary-700 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
