import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-16 text-center',
        className ?? '',
      ].join(' ')}
    >
      {icon && (
        <span className="text-neutral-300" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-neutral-700">{title}</p>
      {description && <p className="max-w-xs text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Module-specific empty state presets
 */
export const EmptyStatePresets = {
  patients: {
    icon: '👥',
    title: 'No Patients Found',
    description: 'Start by adding a new patient to the system.',
  },
  encounters: {
    icon: '📋',
    title: 'No Encounters',
    description: 'Create your first patient encounter to get started.',
  },
  payments: {
    icon: '💳',
    title: 'No Payments',
    description: 'Payment records will appear here as transactions are processed.',
  },
  search: {
    icon: '🔍',
    title: 'No Results Found',
    description: 'Try adjusting your search criteria or filters.',
  },
  appointments: {
    icon: '📅',
    title: 'No Appointments',
    description: 'No scheduled appointments at this time.',
  },
} as const;

export type EmptyStateModule = keyof typeof EmptyStatePresets;

/**
 * Module-specific empty state component
 */
export function ModuleEmptyState({
  module,
  action,
  className,
}: {
  module: EmptyStateModule;
  action?: ReactNode;
  className?: string;
}) {
  const preset = EmptyStatePresets[module];
  return (
    <EmptyState
      icon={preset.icon}
      title={preset.title}
      description={preset.description}
      action={action}
      className={className}
    />
  );
}
