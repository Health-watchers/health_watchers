'use client';

import { useAuth } from '@/context/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="bg-neutral-0 flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4">
      {/* Left: hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="focus:ring-primary-500 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:ring-2 focus:outline-none md:hidden"
          aria-label="Open navigation menu"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* App logo (visible on mobile since sidebar is hidden) */}
        <span className="text-primary-500 text-base font-bold md:hidden">HealthWatchers</span>
      </div>

      {/* Center: clinic name */}
      <span className="absolute left-1/2 hidden -translate-x-1/2 text-sm font-semibold text-neutral-700 sm:block">
        {user?.clinicName ?? 'Health Watchers'}
      </span>

      {/* Right: notification bell + avatar + logout */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div
          className="bg-primary-500 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white select-none"
          aria-label={user ? `Logged in as ${user.name}` : 'Not logged in'}
          title={user?.name}
        >
          {user?.avatarInitials ?? '?'}
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-neutral-500 hover:text-neutral-800 focus:underline focus:outline-none"
          aria-label="Log out"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
