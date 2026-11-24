import React from 'react';
import { containers } from '../../lib/design-system';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  /** Layout variant — controls max-width and padding */
  variant?: keyof typeof containers;
  /** Additional classes */
  className?: string;
  /** HTML element to render as */
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * ResponsiveContainer
 * Issue #1221 — Responsive Design System Refactor
 *
 * Provides consistent, responsive horizontal padding and max-width constraints
 * across all pages and sections. Defaults to the standard "page" variant.
 *
 * @example
 * // Standard page layout
 * <ResponsiveContainer>...</ResponsiveContainer>
 *
 * @example
 * // Narrow content (e.g. login page)
 * <ResponsiveContainer variant="narrow">...</ResponsiveContainer>
 *
 * @example
 * // Section element
 * <ResponsiveContainer as="section" variant="wide">...</ResponsiveContainer>
 */
export function ResponsiveContainer({
  children,
  variant = 'page',
  className = '',
  as: Tag = 'div',
}: ResponsiveContainerProps) {
  const Tag2 = Tag as React.ElementType;
  return (
    <Tag2 className={[containers[variant], className].filter(Boolean).join(' ')}>
      {children}
    </Tag2>
  );
}
