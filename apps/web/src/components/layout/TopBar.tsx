'use client';

import { useAuth } from '@/context/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
      {/* Left: hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Open navigation menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="md:hidden font-bold text-primary-500 text-base">HealthWatchers</span>
      </div>

      {/* Center: clinic name */}
      <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hidden sm:block">
        {user?.clinicName ?? 'Health Watchers'}
      </span>

      {/* Right: theme toggle + notification bell + avatar + logout */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationBell />
        <div
          className="w-8 h-8 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center select-none"
          aria-label={user ? `Logged in as ${user.name}` : 'Not logged in'}
          title={user?.name}
        >
          {user?.avatarInitials ?? '?'}
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 focus:outline-none focus:underline"
          aria-label="Log out"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
