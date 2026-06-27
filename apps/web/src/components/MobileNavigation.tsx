'use client';

import { Home, Users, FileText, DollarSign, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileNavigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/patients', icon: Users, label: 'Patients' },
    { href: '/encounters', icon: FileText, label: 'Encounters' },
    { href: '/payments', icon: DollarSign, label: 'Payments' },
    { href: '/more', icon: MoreHorizontal, label: 'More' },
  ];

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-200 bg-white md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-full min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="mt-1 text-xs">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
