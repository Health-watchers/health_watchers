import type { ReactNode } from 'react';
import { FileQuestion, Users, Calendar, CreditCard, Bell, FileText, Search } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  illustration?: 'patients' | 'encounters' | 'payments' | 'appointments' | 'notifications' | 'search';
}

const illustrations = {
  patients: Users,
  encounters: FileText,
  payments: CreditCard,
  appointments: Calendar,
  notifications: Bell,
  search: Search,
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  illustration,
}: EmptyStateProps) {
  const IllustrationIcon = illustration ? illustrations[illustration] : null;

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-4 py-16 text-center',
        className ?? '',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {IllustrationIcon ? (
        <div className="rounded-full bg-neutral-100 p-6 dark:bg-neutral-800">
          <IllustrationIcon className="h-12 w-12 text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
        </div>
      ) : icon ? (
        <span className="text-6xl" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <div className="rounded-full bg-neutral-100 p-6 dark:bg-neutral-800">
          <FileQuestion className="h-12 w-12 text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        {description && (
          <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Module-specific empty state presets
 */
export const EmptyStatePresets = {
  patients: {
    illustration: 'patients' as const,
    title: 'emptyStates.patients.title',
    description: 'emptyStates.patients.description',
  },
  encounters: {
    illustration: 'encounters' as const,
    title: 'emptyStates.encounters.title',
    description: 'emptyStates.encounters.description',
  },
  payments: {
    illustration: 'payments' as const,
    title: 'emptyStates.payments.title',
    description: 'emptyStates.payments.description',
  },
  appointments: {
    illustration: 'appointments' as const,
    title: 'emptyStates.appointments.title',
    description: 'emptyStates.appointments.description',
  },
  notifications: {
    illustration: 'notifications' as const,
    title: 'emptyStates.notifications.title',
    description: 'emptyStates.notifications.description',
  },
  search: {
    illustration: 'search' as const,
    title: 'emptyStates.search.title',
    description: 'emptyStates.search.description',
  },
} as const;

export type EmptyStateModule = keyof typeof EmptyStatePresets;

/**
 * Module-specific empty state component with i18n support
 */
export function ModuleEmptyState({
  module,
  action,
  className,
  t,
}: {
  module: EmptyStateModule;
  action?: ReactNode;
  className?: string;
  t: (key: string) => string;
}) {
  const preset = EmptyStatePresets[module];
  return (
    <EmptyState
      illustration={preset.illustration}
      title={t(preset.title)}
      description={t(preset.description)}
      action={action}
      className={className}
    />
  );
}
