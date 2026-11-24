'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface QuickAction {
  icon: string;
  /** Key under `dashboard.quickActions` in the message files */
  labelKey: string;
  href: string;
  color: string;
}

interface QuickActionsWidgetProps {
  actions?: QuickAction[];
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    icon: '➕',
    labelKey: 'newPatient',
    href: '/patients/new',
    color: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  {
    icon: '📋',
    labelKey: 'logEncounter',
    href: '/encounters/new',
    color: 'bg-green-50 text-green-700 hover:bg-green-100',
  },
  {
    icon: '📅',
    labelKey: 'bookAppointment',
    href: '/appointments',
    color: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
  },
  {
    icon: '💳',
    labelKey: 'processPayment',
    href: '/payments',
    color: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  },
  {
    icon: '👥',
    labelKey: 'viewPatients',
    href: '/patients',
    color: 'bg-pink-50 text-pink-700 hover:bg-pink-100',
  },
  {
    icon: '⚙️',
    labelKey: 'settings',
    href: '/settings',
    color: 'bg-gray-50 text-gray-700 hover:bg-gray-100',
  },
];

export function QuickActionsWidget({ actions = DEFAULT_ACTIONS }: QuickActionsWidgetProps) {
  const t = useTranslations('dashboard.quickActions');

  return (
    <section aria-label={t('title')} className="space-y-3">
      <h2 className="px-1 text-sm font-semibold text-gray-700">{t('title')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((action) => {
          const label = t(action.labelKey);
          return (
            <Link
              key={action.labelKey}
              href={action.href}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-transparent p-3 text-sm font-medium transition-colors ${action.color}`}
              title={label}
            >
              <span className="text-lg">{action.icon}</span>
              <span className="text-center text-xs">{label}</span>
            </Link>
          );
        })}
    <section aria-label="Quick actions" className="space-y-3">
      <h2 className="px-1 text-sm font-semibold text-gray-700">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-transparent p-3 text-sm font-medium transition-colors ${action.color}`}
            title={action.label}
          >
            <span className="text-lg">{action.icon}</span>
            <span className="text-center text-xs">{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
