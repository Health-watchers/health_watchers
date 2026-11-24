import React from 'react';
import { grids } from '../../lib/design-system';

interface ResponsiveGridProps {
  children: React.ReactNode;
  /**
   * Grid column preset:
   * - cols2: 1 → 2 columns
   * - cols3: 1 → 2 → 3 columns
   * - cols4: 1 → 2 → 4 columns
   * - dashboard: 1 → 2 → 3 columns (optimised for dashboard cards)
   * - sidebar: 1 column → sidebar+main on lg
   * - autoFit: auto-fill with min 280px columns
   */
  cols?: keyof typeof grids;
  /** Additional Tailwind classes */
  className?: string;
}

/**
 * ResponsiveGrid
 * Issue #1221 — Responsive Design System Refactor
 *
 * Drop-in responsive grid with pre-defined column presets.
 * All presets are mobile-first (single column on xs, expanding on larger screens).
 *
 * @example
 * <ResponsiveGrid cols="cols3">
 *   <PatientCard />
 *   <PatientCard />
 *   <PatientCard />
 * </ResponsiveGrid>
 *
 * @example
 * // Dashboard layout
 * <ResponsiveGrid cols="dashboard">
 *   <StatsCard />
 *   <StatsCard />
 * </ResponsiveGrid>
 */
export function ResponsiveGrid({
  children,
  cols = 'cols2',
  className = '',
}: ResponsiveGridProps) {
  return (
    <div className={[grids[cols], className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
