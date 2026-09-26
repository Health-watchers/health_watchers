'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import ClinicSwitcher from '@/components/layout/ClinicSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { Locale } from '@/lib/locales';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const t = useTranslations('nav');
  const locale = useLocale() as Locale;

  return (
    <header className="bg-neutral-0 flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-700 dark:bg-neutral-800">
      {/* Left: hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="focus:ring-primary-500 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:ring-2 focus:outline-none md:hidden dark:text-neutral-400 dark:hover:bg-neutral-700"
          aria-label={t('openNavigation')}
          className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-700"
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
        <span className="text-base font-bold text-primary-500 md:hidden">HealthWatchers</span>
      </div>

      {/* Center: clinic name */}
      <span className="absolute left-1/2 hidden -translate-x-1/2 text-sm font-semibold text-neutral-700 sm:block dark:text-neutral-200">
        {user?.clinicName ?? t('appName')}
      </span>

      {/* Right: clinic switcher (SUPER_ADMIN) + theme toggle + notification bell + avatar + logout */}
      <div className="flex items-center gap-3">
        <ClinicSwitcher />
        <LanguageSwitcher current={locale} />
        <ThemeToggle />
        <NotificationBell />
        <div
          role="img"
          className="bg-primary-500 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white select-none"
          aria-label={user ? t('loggedInAs', { name: user.name }) : t('notLoggedIn')}
          className="flex h-8 w-8 select-none items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white"
          aria-label={user ? `Logged in as ${user.name}` : 'Not logged in'}
          title={user?.name}
        >
          {user?.avatarInitials ?? '?'}
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-neutral-500 hover:text-neutral-800 focus:underline focus:outline-none dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {t('logout')}
        </button>
      </div>
    </header>
  );
}
