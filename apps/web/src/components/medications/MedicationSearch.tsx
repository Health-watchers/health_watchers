'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import { searchDrugs } from '@/lib/medications/catalog';
import type { Drug } from '@/lib/medications/types';

export interface MedicationSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (drug: Drug) => void;
  /** The drug the clinician has confirmed, if any. */
  selectedDrug: Drug | null;
  label?: string;
  placeholder?: string;
}

const LIST_ID = 'medication-search-listbox';

/**
 * Issue #1314 — medication search with autocomplete.
 * Implements the ARIA combobox pattern (keyboard + pointer driven) and searches
 * the local formulary by brand name, generic name and drug class.
 */
export function MedicationSearch({
  query,
  onQueryChange,
  onSelect,
  selectedDrug,
  label = 'Medication',
  placeholder = 'Search by name, generic or class…',
}: MedicationSearchProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => searchDrugs(query), [query]);
  const showResults = open && query.trim().length > 0 && results.length > 0;

  const commit = (drug: Drug) => {
    onSelect(drug);
    onQueryChange(drug.name);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (event.key === 'Enter' && open) {
      const drug = results[activeIndex];
      if (drug) {
        event.preventDefault();
        commit(drug);
      }
    }
  };

  return (
    <div className="relative">
      <Input
        label={label}
        placeholder={placeholder}
        value={query}
        role="combobox"
        aria-expanded={showResults}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={
          showResults ? `${LIST_ID}-option-${activeIndex}` : undefined
        }
        autoComplete="off"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />

      {showResults && (
        <ul
          id={LIST_ID}
          role="listbox"
          aria-label="Medication suggestions"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          {results.map((drug, index) => (
            <li
              key={drug.id}
              id={`${LIST_ID}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(drug)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  commit(drug);
                }
              }}
              className={[
                'cursor-pointer px-3 py-2 text-sm',
                index === activeIndex
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-neutral-700 dark:text-neutral-200',
              ].join(' ')}
            >
              <span className="block font-medium">{drug.name}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {drug.genericName} · {drug.drugClass} · {drug.commonDosages.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length > 0 && results.length === 0 && (
        <p role="status" className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          No formulary match for &ldquo;{query}&rdquo;. Check the spelling or search the generic
          name.
        </p>
      )}

      {selectedDrug && (
        <p className="text-primary-600 dark:text-primary-400 mt-1 text-xs">
          Selected: {selectedDrug.name} ({selectedDrug.genericName}) · {selectedDrug.drugClass}
        </p>
      )}
    </div>
  );
}
