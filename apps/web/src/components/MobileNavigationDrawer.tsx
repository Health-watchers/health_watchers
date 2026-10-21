'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, FileText, Wallet, Settings, Bell, Users2, BarChart3, Pill } from 'lucide-react';

interface DrawerItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface MobileNavigationDrawerProps {
  items?: DrawerItem[];
  onClose: () => void;
  isOpen: boolean;
}

const defaultItems: DrawerItem[] = [
  {
    href: '/encounters',
    label: 'Encounters',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    href: '/medications',
    label: 'Medications',
    icon: <Pill className="h-5 w-5" />,
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: <Bell className="h-5 w-5" />,
  },
  {
    href: '/staff',
    label: 'Staff',
    icon: <Users2 className="h-5 w-5" />,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: <Settings className="h-5 w-5" />,
  },
];

export function MobileNavigationDrawer({
  items = defaultItems,
  onClose,
  isOpen,
}: MobileNavigationDrawerProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current) return;

    const touchCurrentX = e.touches[0].clientX;
    const touchCurrentY = e.touches[0].clientY;

    const diffX = touchStartX.current - touchCurrentX;
    const diffY = Math.abs(touchStartY.current - touchCurrentY);

    // Allow swipe left to close while dragging
    if (diffX > 0 && diffY < 50 && drawerRef.current) {
      const translateX = Math.min(diffX, 256); // Max width of drawer
      drawerRef.current.style.transform = `translateX(-${translateX}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current || !drawerRef.current) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX.current - touchEndX;
    const diffY = Math.abs(touchStartY.current - touchEndY);

    // Reset transform
    drawerRef.current.style.transform = '';

    // Swipe left to close (more than 80px horizontally, less than 50px vertically)
    if (diffX > 80 && diffY < 50) {
      onClose();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out md:hidden"
        onClick={handleBackdropClick}
        role="presentation"
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="fixed right-0 top-0 z-50 h-screen w-64 transform bg-white shadow-xl transition-transform duration-300 ease-in-out md:hidden dark:bg-neutral-800"
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex min-h-[44px] items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Menu</h2>
          <button
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="overflow-y-auto px-3 py-4" style={{ height: 'calc(100vh - 60px)' }}>
          <div className="space-y-1">
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    {item.icon}
                  </div>
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-danger-500 px-1.5 text-xs font-semibold text-white">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}
