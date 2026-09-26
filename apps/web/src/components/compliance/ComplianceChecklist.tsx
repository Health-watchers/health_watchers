'use client';

import { useState } from 'react';
import type { ComplianceChecklistItem } from './types';

interface ComplianceChecklistProps {
  items?: ComplianceChecklistItem[];
  onStatusChange?: (itemId: string, status: ComplianceChecklistItem['status']) => Promise<void>;
}

const PRIORITY_COLORS: Record<ComplianceChecklistItem['priority'], string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

const STATUS_COLORS: Record<ComplianceChecklistItem['status'], string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
};

export function ComplianceChecklist({ items = [], onStatusChange }: ComplianceChecklistProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleStatusChange = async (
    itemId: string,
    newStatus: ComplianceChecklistItem['status']
  ) => {
    if (!onStatusChange) return;

    setUpdating(itemId);
    try {
      await onStatusChange(itemId, newStatus);
    } finally {
      setUpdating(null);
    }
  };

  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, ComplianceChecklistItem[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Compliance Checklist</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Track compliance tasks and requirements
        </p>
      </div>

      {Object.entries(grouped).map(([category, categoryItems]) => {
        const completed = categoryItems.filter((i) => i.status === 'completed').length;
        const progress = (completed / categoryItems.length) * 100;

        return (
          <div key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{category}</h4>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {completed}/{categoryItems.length}
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                >
                  <input
                    type="checkbox"
                    checked={item.status === 'completed'}
                    onChange={(e) =>
                      handleStatusChange(item.id, e.target.checked ? 'completed' : 'pending')
                    }
                    disabled={updating === item.id}
                    className="mt-1 accent-green-500"
                  />

                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {item.title}
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {item.description}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[item.priority]}`}
                      >
                        {item.priority}
                      </span>
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {item.dueDate && (
                    <div className="text-right text-xs text-neutral-600 dark:text-neutral-400">
                      <div>Due:</div>
                      <div>{new Date(item.dueDate).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
