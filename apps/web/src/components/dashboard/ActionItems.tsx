'use client';

interface ActionItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  completed?: boolean;
}

interface ActionItemsProps {
  items: ActionItem[];
  loading?: boolean;
}

export function ActionItems({ items, loading }: ActionItemsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
    );
  }

  const pending = items.filter((i) => !i.completed);

  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">All caught up! ✓</p>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-danger-500 bg-danger-50 dark:bg-danger-900/20';
      case 'medium':
        return 'border-l-warning-500 bg-warning-50 dark:bg-warning-900/20';
      default:
        return 'border-l-success-500 bg-success-50 dark:bg-success-900/20';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟡';
      default:
        return '🟢';
    }
  };

  return (
    <div className="space-y-2">
      {pending.map((item) => (
        <div
          key={item.id}
          className={`flex gap-3 rounded-r-lg border-l-4 p-3 dark:border-neutral-700 ${getPriorityColor(item.priority)}`}
        >
          <input
            type="checkbox"
            defaultChecked={item.completed}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary-600"
            aria-label={`Mark ${item.title} as complete`}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-neutral-900 dark:text-neutral-50">{item.title}</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{item.description}</p>
            {item.dueDate && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Due: {new Date(item.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
          <span className="flex-shrink-0 text-lg">{getPriorityLabel(item.priority)}</span>
        </div>
      ))}
    </div>
  );
}
