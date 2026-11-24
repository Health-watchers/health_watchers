'use client';

import { useMemo, useState } from 'react';
import { Badge, SearchInput } from '@/components/ui';
import { ANALYTE_DEFINITIONS, formatReferenceRange } from '@/lib/lab-results/referenceRanges';
import type { AnalyteKey, LabPanel } from '@/lib/lab-results/types';

export interface InterpretationGuideProps {
  selectedAnalyte: AnalyteKey | null;
  onSelectAnalyte: (analyte: AnalyteKey) => void;
}

interface PanelGroup {
  panel: LabPanel;
  items: typeof ANALYTE_DEFINITIONS;
}

/**
 * Issue #1313 — result interpretation guides.
 * Plain-language guidance, reference intervals and the clinical meaning of a
 * raised or reduced value, grouped by panel.
 */
export function InterpretationGuide({
  selectedAnalyte,
  onSelectAnalyte,
}: InterpretationGuideProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo<PanelGroup[]>(() => {
    const term = query.trim().toLowerCase();
    const matching = ANALYTE_DEFINITIONS.filter((definition) => {
      if (!term) return true;
      return `${definition.name} ${definition.shortName} ${definition.panel} ${definition.interpretation}`
        .toLowerCase()
        .includes(term);
    });

    const byPanel = new Map<LabPanel, typeof ANALYTE_DEFINITIONS>();
    for (const definition of matching) {
      const existing = byPanel.get(definition.panel);
      if (existing) existing.push(definition);
      else byPanel.set(definition.panel, [definition]);
    }

    return Array.from(byPanel, ([panel, items]) => ({ panel, items }));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="sm:max-w-sm">
        <label
          htmlFor="lab-guide-search"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Search the interpretation guide
        </label>
        <SearchInput
          id="lab-guide-search"
          placeholder="Test or panel…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No guidance matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.panel} aria-label={`${group.panel} guidance`} className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {group.panel}
            </h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((definition) => (
                <li key={definition.key}>
                  <button
                    type="button"
                    onClick={() => onSelectAnalyte(definition.key)}
                    aria-pressed={selectedAnalyte === definition.key}
                    className={[
                      'w-full rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                      selectedAnalyte === definition.key
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/30'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700',
                    ].join(' ')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {definition.name}
                      </span>
                      <Badge variant="default">{definition.shortName}</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                      Reference {formatReferenceRange(definition)}
                    </span>
                    <span className="mt-1 block text-sm text-neutral-700 dark:text-neutral-300">
                      {definition.interpretation}
                    </span>
                    <span className="mt-2 block text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">High: </span>
                      {definition.highMeaning}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Low: </span>
                      {definition.lowMeaning}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
