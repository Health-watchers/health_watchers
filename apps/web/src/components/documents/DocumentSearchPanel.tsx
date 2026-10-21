'use client';

import { Badge, Button, Input } from '@/components/ui';
import type { SearchMatch } from '@/lib/documents/types';

export interface DocumentSearchPanelProps {
  query: string;
  matches: readonly SearchMatch[];
  activeIndex: number;
  onQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  onStep: (direction: 1 | -1) => void;
  onSelectMatch: (index: number) => void;
}

/** Issue #1316 — search within documents. */
export function DocumentSearchPanel({
  query,
  matches,
  activeIndex,
  onQueryChange,
  onSearchSubmit,
  onStep,
  onSelectMatch,
}: DocumentSearchPanelProps) {
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <Input
            label="Search this document"
            type="search"
            placeholder="e.g. warfarin"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" variant="primary">
          Find
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onStep(-1)}
          disabled={matches.length === 0}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onStep(1)}
          disabled={matches.length === 0}
        >
          Next
        </Button>
      </form>

      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {query.trim().length === 0
          ? 'Enter a term to search the extracted text of every page.'
          : matches.length === 0
            ? `No matches for “${query.trim()}”.`
            : `${matches.length} match${matches.length === 1 ? '' : 'es'} · showing ${
                activeIndex + 1
              }`}
      </p>

      {matches.length > 0 && (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {matches.map((match, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={`${match.page}-${match.matchStart}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectMatch(index)}
                  aria-current={isActive ? 'true' : undefined}
                  className={[
                    'w-full rounded-md border p-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    isActive
                      ? 'border-primary-500 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/30'
                      : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="default">Page {match.page}</Badge>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      character {match.matchStart + 1}
                    </span>
                  </span>
                  <span className="mt-1 block text-neutral-700 dark:text-neutral-300">
                    {match.snippet}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
