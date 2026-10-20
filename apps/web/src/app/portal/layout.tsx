import Link from 'next/link';
import { ReactNode } from 'react';

const NAV = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/timeline', label: 'Timeline' },
  { href: '/portal/records', label: 'My Records' },
  { href: '/portal/encounters', label: 'My Encounters' },
  { href: '/portal/appointments', label: 'Appointments' },
  { href: '/portal/payments', label: 'Payments' },
  { href: '/portal/consent', label: 'Consent' },
  { href: '/portal/health-log', label: 'Health Log' },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white shadow-sm dark:bg-gray-800 dark:shadow-gray-900/50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            Health Watchers — Patient Portal
          </span>
          <form action="/api/portal/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Sign out
            </button>
          </form>
        </div>
        <nav className="mx-auto max-w-4xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-1">
            {NAV.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block rounded-t-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-300"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 text-gray-900 dark:text-gray-100">
        {children}
      </main>
    </div>
  );
}
