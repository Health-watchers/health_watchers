'use client';

import { useState } from 'react';

export function SearchTips() {
  const [showTips, setShowTips] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowTips(!showTips)}
        className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
        title="Search tips"
        aria-label="Show search tips"
      >
        <span className="text-lg">?</span>
      </button>

      {showTips && (
        <div className="absolute right-0 top-8 z-10 w-64 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">Search Tips</h3>
          <ul className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>
              • <kbd>Ctrl+/</kbd> Focus search box
            </li>
            <li>• Search by name, ID, or condition</li>
            <li>• Use filters for complex queries</li>
            <li>• Results update in real-time</li>
            <li>• Up to 100k records supported</li>
          </ul>
          <button
            type="button"
            onClick={() => setShowTips(false)}
            className="mt-3 w-full rounded text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-neutral-700"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
