'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCommandPalette } from './CommandPaletteContext';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import type { AppRole } from '@/context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientResult {
  _id: string;
  firstName: string;
  lastName: string;
  systemId: string;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  group: 'navigation';
  allowedRoles?: AppRole[];
  icon: string;
}

interface ActionItem {
  id: string;
  label: string;
  action: () => void;
  group: 'quick-actions';
  allowedRoles?: AppRole[];
  icon: string;
}

interface RecentItem {
  id: string;
  label: string;
  href: string;
  group: 'recent';
  subtitle?: string;
  icon: string;
}

type PaletteItem =
  | NavItem
  | ActionItem
  | RecentItem
  | { id: string; label: string; group: 'patient'; subtitle?: string; href: string; icon: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const RECENT_ITEMS_KEY = 'hw:command-palette:recent';
const MAX_RECENT = 5;

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', href: '/', group: 'navigation', icon: '🏠' },
  { id: 'nav-patients', label: 'Patients', href: '/patients', group: 'navigation', icon: '👤' },
  {
    id: 'nav-encounters',
    label: 'Encounters',
    href: '/encounters',
    group: 'navigation',
    icon: '📋',
  },
  {
    id: 'nav-appointments',
    label: 'Appointments',
    href: '/appointments',
    group: 'navigation',
    icon: '📅',
  },
  { id: 'nav-billing', label: 'Billing', href: '/billing', group: 'navigation', icon: '💳' },
  { id: 'nav-reports', label: 'Reports', href: '/reports', group: 'navigation', icon: '📊' },
  { id: 'nav-settings', label: 'Settings', href: '/settings', group: 'navigation', icon: '⚙️' },
  {
    id: 'nav-compliance',
    label: 'Compliance',
    href: '/compliance',
    group: 'navigation',
    icon: '🛡️',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  },
  {
    id: 'nav-research-exports',
    label: 'Research Exports',
    href: '/research/exports',
    group: 'navigation',
    icon: '🔬',
    allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  },
];

function getActionItems(router: ReturnType<typeof useRouter>): ActionItem[] {
  return [
    {
      id: 'action-new-encounter',
      label: 'New Encounter',
      action: () => router.push('/encounters/new'),
      group: 'quick-actions',
      icon: '➕',
      allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE'],
    },
    {
      id: 'action-new-appointment',
      label: 'New Appointment',
      action: () => router.push('/appointments'),
      group: 'quick-actions',
      icon: '📆',
      allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT'],
    },
    {
      id: 'action-new-patient',
      label: 'Register New Patient',
      action: () => router.push('/patients/new'),
      group: 'quick-actions',
      icon: '🆕',
      allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT'],
    },
  ];
}

// ── Recent items helpers ──────────────────────────────────────────────────────

function loadRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

function addToRecent(item: RecentItem) {
  const existing = loadRecent().filter((r) => r.id !== item.id);
  saveRecent([item, ...existing]);
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── CommandPalette Component ──────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { user } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<PatientResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, 200);

  // Load recent items on open
  useEffect(() => {
    if (isOpen) {
      setRecentItems(loadRecent());
      setQuery('');
      setActiveIndex(0);
      setPatients([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Patient search
  useEffect(() => {
    if (!isOpen || debouncedQuery.trim().length < 2) {
      setPatients([]);
      setIsSearching(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsSearching(true);

    fetchWithAuth(
      `${API_V1}/patients/search?q=${encodeURIComponent(debouncedQuery.trim())}&limit=6`,
      { signal: abortRef.current.signal }
    )
      .then((res) => res.json())
      .then((data) => {
        setPatients(data.data ?? []);
        setIsSearching(false);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setIsSearching(false);
      });
  }, [debouncedQuery, isOpen]);

  // Build filtered item list
  const role = user?.role;

  const actionItems = getActionItems(router).filter(
    (a) => !a.allowedRoles || !role || a.allowedRoles.includes(role)
  );

  const navItems = NAV_ITEMS.filter(
    (n) => !n.allowedRoles || !role || n.allowedRoles.includes(role)
  ).filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase()));

  const patientItems = patients.map((p) => ({
    id: p._id,
    label: `${p.firstName} ${p.lastName}`,
    subtitle: p.systemId,
    href: `/patients/${p._id}`,
    group: 'patient' as const,
    icon: '🧑‍⚕️',
  }));

  const filteredActions = actionItems.filter(
    (a) => !query || a.label.toLowerCase().includes(query.toLowerCase())
  );

  // Flatten items in display order: patients → nav → actions → recent (only when no query)
  const allItems: PaletteItem[] = query.trim()
    ? [...patientItems, ...navItems, ...filteredActions]
    : [...recentItems, ...navItems, ...filteredActions];

  // Clamp activeIndex
  const safeIndex = Math.min(activeIndex, Math.max(0, allItems.length - 1));

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      if ('href' in item) {
        addToRecent({
          id: item.id,
          label: item.label,
          href: item.href,
          group: 'recent',
          subtitle: (item as { subtitle?: string }).subtitle,
          icon: item.icon,
        });
        router.push(item.href);
      } else if ('action' in item) {
        (item as ActionItem).action();
      }
      close();
    },
    [router, close]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems[safeIndex]) handleSelect(allItems[safeIndex]);
          break;
        case 'Escape':
          close();
          break;
      }
    },
    [allItems, safeIndex, handleSelect, close]
  );

  // Scroll active item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const activeEl = listEl.querySelector<HTMLLIElement>('[aria-selected="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  if (!isOpen) return null;

  // Group labels
  const GROUP_LABELS: Record<string, string> = {
    patient: 'Patients',
    navigation: 'Navigation',
    'quick-actions': 'Quick Actions',
    recent: 'Recent',
  };

  // Render items grouped
  let lastGroup = '';
  let itemIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-700"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <svg
            className="h-5 w-5 shrink-0 text-neutral-400"
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
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={allItems.length > 0}
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={
              allItems[safeIndex] ? `cp-item-${allItems[safeIndex].id}` : undefined
            }
            className="min-w-0 flex-1 bg-transparent text-base text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100"
            placeholder="Search patients, navigate, or take action…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && (
            <div
              className="border-t-primary-500 h-4 w-4 animate-spin rounded-full border-2 border-neutral-300"
              aria-label="Searching…"
            />
          )}
          <kbd className="hidden rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-xs text-neutral-400 sm:inline dark:border-neutral-700">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Command palette results"
          className="max-h-96 overflow-y-auto py-2"
        >
          {allItems.length === 0 && !isSearching && query.length >= 2 && (
            <li className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No results for &ldquo;{query}&rdquo;
            </li>
          )}

          {allItems.length === 0 && !query && (
            <li className="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Start typing to search patients, navigate, or take an action.
            </li>
          )}

          {allItems.map((item) => {
            const index = itemIndex++;
            const isActive = index === safeIndex;
            const showGroupHeader = item.group !== lastGroup;
            if (showGroupHeader) lastGroup = item.group;

            return (
              <li key={item.id} role="presentation">
                {showGroupHeader && (
                  <div
                    className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500"
                    aria-hidden="true"
                  >
                    {GROUP_LABELS[item.group] ?? item.group}
                  </div>
                )}
                <button
                  id={`cp-item-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={[
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800',
                  ].join(' ')}
                >
                  <span className="text-base" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {'subtitle' in item && item.subtitle && (
                    <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                      {item.subtitle}
                    </span>
                  )}
                  {'href' in item && (
                    <span className="shrink-0 text-xs text-neutral-300 dark:text-neutral-600">
                      →
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
          <span>
            <kbd className="rounded border border-neutral-200 px-1 font-mono dark:border-neutral-700">
              ↑
            </kbd>{' '}
            <kbd className="rounded border border-neutral-200 px-1 font-mono dark:border-neutral-700">
              ↓
            </kbd>{' '}
            to navigate
          </span>
          <span>
            <kbd className="rounded border border-neutral-200 px-1 font-mono dark:border-neutral-700">
              ↵
            </kbd>{' '}
            to select
          </span>
          <span>
            Press{' '}
            <kbd className="rounded border border-neutral-200 px-1 font-mono dark:border-neutral-700">
              ?
            </kbd>{' '}
            for all shortcuts
          </span>
        </div>
      </div>
    </>
  );
}
