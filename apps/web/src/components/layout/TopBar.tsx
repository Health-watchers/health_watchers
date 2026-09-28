'use client';

import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import ClinicSwitcher from '@/components/layout/ClinicSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useCommandPalette } from '@/components/CommandPalette';
import type { Locale } from '@/lib/locales';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const locale = useLocale() as Locale;
  const { open: openPalette } = useCommandPalette();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-800">
      {/* Left: hamburger (mobile) + logo */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="focus:ring-primary-500 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-700"
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

        <span className="text-primary-500 text-base font-bold md:hidden">HealthWatchers</span>
      </div>

      {/* Center: Command Palette trigger (hidden on mobile, replaced by ⌘K shortcut) */}
      <button
        type="button"
        onClick={openPalette}
        className="focus:ring-primary-500 hidden items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-100 focus:outline-none focus:ring-2 sm:flex dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
        aria-label="Open command palette (Ctrl+K)"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <span>Search…</span>
        <kbd className="hidden rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-xs text-neutral-400 lg:inline dark:border-neutral-700">
          ⌘K
        </kbd>
      </button>

      {/* Right: clinic switcher + language + theme + notifications + avatar + logout */}
      <div className="flex items-center gap-3">
        <ClinicSwitcher />
        <LanguageSwitcher current={locale} />
        <ThemeToggle />
        <NotificationBell />
        <div
          className="bg-primary-500 flex h-8 w-8 select-none items-center justify-center rounded-full text-xs font-bold text-white"
          aria-label={user ? `Logged in as ${user.name}` : 'Not logged in'}
          title={user?.name}
          role="img"
        >
          {user?.avatarInitials ?? '?'}
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-neutral-500 hover:text-neutral-800 focus:underline focus:outline-none dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
