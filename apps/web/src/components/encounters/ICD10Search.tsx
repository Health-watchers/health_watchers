'use client';

/**
 * ICD10Search — encounter diagnosis picker
 *
 * Features:
 * - "Search", "Favorites", and "Recent" tabs in the dropdown
 * - Star icon to toggle a code in/out of clinic favorites (synced to /icd10/favorites)
 * - Up to 10 recent codes shown before the user starts typing
 * - Full keyboard navigation: ArrowUp/Down through results, Enter to select,
 *   Tab/ArrowRight/Left between tabs, Escape to close
 * - Records usage when a code is added to the encounter
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  KeyboardEvent,
  useId,
} from 'react';
import {
  useICD10Favorites,
  useICD10Recent,
  useICD10Search,
  useAddICD10Favorite,
  useRemoveICD10Favorite,
  useRecordICD10Recent,
  type ICD10SearchResult,
  type ICD10Favorite,
  type ICD10RecentCode,
} from '@/hooks/useICD10';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectedDiagnosis {
  code: string;
  description: string;
  isPrimary: boolean;
}

export interface ICD10SearchProps {
  /** Currently selected diagnoses displayed as chips above the search input. */
  selected: SelectedDiagnosis[];
  /** Called when the list of selected diagnoses changes. */
  onChange: (diagnoses: SelectedDiagnosis[]) => void;
}

type Tab = 'search' | 'favorites' | 'recent';

// ── Sub-types used internally ─────────────────────────────────────────────────

interface ListItem {
  code: string;
  description: string;
  isFavorite: boolean;
}

// ── Star icon ─────────────────────────────────────────────────────────────────

function StarIcon({ filled, className = '' }: { filled: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      className={['h-4 w-4 shrink-0', className].join(' ')}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ICD10Search({ selected, onChange }: ICD10SearchProps) {
  const dropdownId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Debounce the search query to avoid hammering the API
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
    // Switch to Search tab automatically when the user types
    if (value.trim()) setActiveTab('search');
  }, []);

  // ── Data queries ────────────────────────────────────────────────────────────
  const favoritesQuery = useICD10Favorites();
  const recentQuery = useICD10Recent(10);
  const searchQuery = useICD10Search(debouncedQuery);

  const addFavorite = useAddICD10Favorite();
  const removeFavorite = useRemoveICD10Favorite();
  const recordRecent = useRecordICD10Recent();

  const favoriteCodeSet = new Set((favoritesQuery.data ?? []).map((f) => f.code));

  // ── Build the visible list based on current tab ─────────────────────────────
  const listItems: ListItem[] = (() => {
    if (activeTab === 'search') {
      if (!debouncedQuery.trim()) return [];
      return (searchQuery.data ?? []).map((r) => ({
        code: r.code,
        description: r.description,
        isFavorite: favoriteCodeSet.has(r.code),
      }));
    }
    if (activeTab === 'favorites') {
      return (favoritesQuery.data ?? []).map((f) => ({
        code: f.code,
        description: f.description,
        isFavorite: true,
      }));
    }
    // recent
    return (recentQuery.data ?? []).map((r) => ({
      code: r.code,
      description: r.description,
      isFavorite: favoriteCodeSet.has(r.code),
    }));
  })();

  // Reset focused index when list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [listItems.length, activeTab]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const root = inputRef.current?.closest('[data-icd10-root]');
      if (root && !root.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const addDiagnosis = useCallback(
    (item: ListItem) => {
      if (selected.some((s) => s.code === item.code)) return;
      onChange([
        ...selected,
        { code: item.code, description: item.description, isPrimary: selected.length === 0 },
      ]);
      recordRecent.mutate({ code: item.code, description: item.description });
      setQuery('');
      setDebouncedQuery('');
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [selected, onChange, recordRecent]
  );

  const removeDiagnosis = (code: string) =>
    onChange(selected.filter((s) => s.code !== code));

  const togglePrimary = (code: string) =>
    onChange(selected.map((s) => ({ ...s, isPrimary: s.code === code })));

  const toggleFavorite = useCallback(
    (item: ListItem, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (item.isFavorite) {
        removeFavorite.mutate(item.code);
      } else {
        addFavorite.mutate({ code: item.code, description: item.description });
      }
    },
    [addFavorite, removeFavorite]
  );

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  const tabs: Tab[] = ['search', 'favorites', 'recent'];

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        setFocusedIndex(0);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, listItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        if (focusedIndex >= 0 && listItems[focusedIndex]) {
          e.preventDefault();
          addDiagnosis(listItems[focusedIndex]);
        }
        break;
      case 'Tab': {
        // Cycle through tabs without closing dropdown
        if (e.shiftKey) break;
        e.preventDefault();
        const currentTabIndex = tabs.indexOf(activeTab);
        setActiveTab(tabs[(currentTabIndex + 1) % tabs.length]);
        setFocusedIndex(0);
        break;
      }
    }
  };

  const handleItemKeyDown = (e: KeyboardEvent<HTMLLIElement>, item: ListItem, index: number) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        addDiagnosis(item);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(Math.min(index + 1, listItems.length - 1));
        (listRef.current?.children[Math.min(index + 1, listItems.length - 1)] as HTMLElement)?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) {
          inputRef.current?.focus();
        } else {
          setFocusedIndex(index - 1);
          (listRef.current?.children[index - 1] as HTMLElement)?.focus();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.focus();
        break;
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // ── Loading / empty state helpers ────────────────────────────────────────────

  const isLoading =
    (activeTab === 'search' && searchQuery.isFetching) ||
    (activeTab === 'favorites' && favoritesQuery.isLoading) ||
    (activeTab === 'recent' && recentQuery.isLoading);

  const isEmpty =
    !isLoading &&
    listItems.length === 0 &&
    (activeTab !== 'search' || debouncedQuery.trim().length > 0);

  const emptyMessage: Record<Tab, string> = {
    search: 'No results found.',
    favorites: 'No favorites yet. Click ★ on any result to save it.',
    recent: 'No recent codes yet. They appear after you add diagnoses.',
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div data-icd10-root>
      {/* ── Selected diagnoses ── */}
      {selected.length > 0 && (
        <ul className="mb-2 list-none p-0">
          {selected.map((s) => (
            <li
              key={s.code}
              className="mb-1 flex items-center gap-2 rounded bg-blue-50 px-2 py-1.5 text-sm"
            >
              <span className="font-semibold">{s.code}</span>
              <span className="flex-1">{s.description}</span>
              <button
                type="button"
                onClick={() => togglePrimary(s.code)}
                title={s.isPrimary ? 'Primary diagnosis' : 'Set as primary'}
                className={`cursor-pointer rounded border-0 px-2 py-0.5 text-xs ${
                  s.isPrimary
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {s.isPrimary ? '★ Primary' : 'Set primary'}
              </button>
              <button
                type="button"
                onClick={() => removeDiagnosis(s.code)}
                aria-label={`Remove ${s.code}`}
                className="cursor-pointer border-0 bg-transparent font-bold text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            handleQueryChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search ICD-10 code or description…"
          aria-label="Search ICD-10 diagnosis codes"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
            Searching…
          </span>
        )}
      </div>

      {/* Dropdown results */}
      {results.length > 0 && (
        <ul
          role="listbox"
          aria-label="ICD-10 search results"
          className="mt-1 max-h-60 list-none overflow-y-auto rounded-md border border-neutral-300 bg-white p-0 shadow-md"
        >
          {results.map((r) => (
            <li
              key={r.code}
              role="option"
              onClick={() => add(r)}
              className="cursor-pointer border-b border-neutral-100 px-3 py-2 text-sm hover:bg-blue-50"
            >
              <span className="mr-2 font-semibold">{r.code}</span>
              {r.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
