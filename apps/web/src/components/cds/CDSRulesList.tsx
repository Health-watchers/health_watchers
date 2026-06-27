import type { CDSRule, RuleCategory, RuleTrigger, AlertAction, AlertSeverity } from '@/types/cds';

export interface CDSRulesListProps {
  rules: CDSRule[];
  onEdit: (rule: CDSRule) => void;
  onTest: (rule: CDSRule) => void;
  onDelete: (ruleId: string) => void;
  isDeleting: boolean;
}

const categoryColors: Record<RuleCategory, string> = {
  drug_interaction: 'bg-blue-100 text-blue-800',
  screening: 'bg-green-100 text-green-800',
  vital_sign: 'bg-red-100 text-red-800',
  care_gap: 'bg-yellow-100 text-yellow-800',
  allergy: 'bg-purple-100 text-purple-800',
};

const severityColors: Record<AlertSeverity, string> = {
  info: 'text-blue-600',
  warning: 'text-yellow-600',
  critical: 'text-red-600',
};

export function CDSRulesList({ rules, onEdit, onTest, onDelete, isDeleting }: CDSRulesListProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
        <p className="text-sm text-neutral-600">No CDS rules configured yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <div
          key={rule.ruleId}
          className="rounded-lg border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-neutral-900">{rule.name}</h3>
              <p className="mt-1 text-sm text-neutral-600">{rule.description}</p>
            </div>
            <div className="ml-4 flex gap-2">
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${categoryColors[rule.category]}`}
              >
                {rule.category.replace(/_/g, ' ')}
              </span>
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  rule.isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-800'
                }`}
              >
                {rule.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-neutral-700">Trigger:</span>
              <p className="text-neutral-600">{rule.trigger.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <span className="font-medium text-neutral-700">Action:</span>
              <p className={`${severityColors[rule.action.severity]}`}>
                {rule.action.type} ({rule.action.severity})
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-md bg-neutral-50 p-3">
            <p className="text-xs font-medium text-neutral-700">Message:</p>
            <p className="mt-1 text-sm text-neutral-600">{rule.action.message}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onEdit(rule)}
              className="bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-md px-3 py-2 text-sm font-medium"
            >
              Edit
            </button>
            <button
              onClick={() => onTest(rule)}
              className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Test
            </button>
            <button
              onClick={() => onDelete(rule.ruleId)}
              disabled={isDeleting}
              className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
