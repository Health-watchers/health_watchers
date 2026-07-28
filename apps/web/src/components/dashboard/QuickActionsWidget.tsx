'use client';

import Link from 'next/link';

interface QuickAction {
  icon: string;
  label: string;
  href: string;
  color: string;
}

interface QuickActionsWidgetProps {
  actions?: QuickAction[];
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    icon: '➕',
    label: 'New Patient',
    href: '/patients/new',
    color: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  {
    icon: '📋',
    label: 'Log Encounter',
    href: '/encounters/new',
    color: 'bg-green-50 text-green-700 hover:bg-green-100',
  },
  {
    icon: '📅',
    label: 'Book Appointment',
    href: '/appointments',
    color: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
  },
  {
    icon: '💳',
    label: 'Process Payment',
    href: '/payments',
    color: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  },
  {
    icon: '👥',
    label: 'View Patients',
    href: '/patients',
    color: 'bg-pink-50 text-pink-700 hover:bg-pink-100',
  },
  {
    icon: '⚙️',
    label: 'Settings',
    href: '/settings',
    color: 'bg-gray-50 text-gray-700 hover:bg-gray-100',
  },
];

export function QuickActionsWidget({ actions = DEFAULT_ACTIONS }: QuickActionsWidgetProps) {
  return (
    <section aria-label="Quick actions" className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 px-1">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg p-3 text-sm font-medium transition-colors border border-transparent ${action.color}`}
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
