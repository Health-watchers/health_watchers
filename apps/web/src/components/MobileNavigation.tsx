'use client';

import { Home, Users, Calendar, DollarSign, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MobileNavigationDrawer } from './MobileNavigationDrawer';

export function MobileNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/patients', icon: Users, label: 'Patients' },
    { href: '/appointments', icon: Calendar, label: 'Appointments' },
    { href: '/payments', icon: DollarSign, label: 'Payments' },
  ];

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white pb-safe md:hidden dark:border-neutral-700 dark:bg-neutral-800"
        role="navigation"
        aria-label="Mobile bottom navigation"
      >
        <div className="flex h-16 items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-full min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-2xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-full min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
            <span className="text-2xs font-medium">More</span>
          </button>
        </div>
      </nav>
      <MobileNavigationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
