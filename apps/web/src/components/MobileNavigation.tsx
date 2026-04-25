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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
