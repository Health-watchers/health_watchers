import React from 'react';

const gapClasses = {
  xs: 'gap-1 sm:gap-2',
  sm: 'gap-2 sm:gap-3',
  md: 'gap-4 sm:gap-6',
  lg: 'gap-6 sm:gap-8',
  xl: 'gap-8 sm:gap-10',
} as const;

const directionClasses = {
  vertical: 'flex flex-col',
  horizontal: 'flex flex-row flex-wrap',
  responsive: 'flex flex-col sm:flex-row',
  'responsive-reverse': 'flex flex-col-reverse sm:flex-row',
} as const;

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
} as const;

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
} as const;

interface ResponsiveStackProps {
  children: React.ReactNode;
  /** Additional Tailwind classes */
  className?: string;
  /**
   * Stack direction:
   * - vertical: always column
   * - horizontal: always row (wraps)
   * - responsive: column on mobile, row on sm+
   * - responsive-reverse: reverse column on mobile, row on sm+
   */
  direction?: keyof typeof directionClasses;
  /** Gap between items */
  gap?: keyof typeof gapClasses;
  /** Align items on the cross axis */
  align?: keyof typeof alignClasses;
  /** Justify items on the main axis */
  justify?: keyof typeof justifyClasses;
  /** Render as a different element */
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * ResponsiveStack
 * Issue #1221 — Responsive Design System Refactor
 *
 * A flexible layout primitive for building mobile-first stacked or
 * inline layouts. Replaces ad-hoc flex utilities scattered across pages.
 *
 * @example
 * // Vertical stack (default)
 * <ResponsiveStack gap="md">
 *   <FormField />
 *   <FormField />
 * </ResponsiveStack>
 *
 * @example
 * // Responsive: column on mobile → row on sm+
 * <ResponsiveStack direction="responsive" align="center" justify="between">
 *   <PageTitle />
 *   <ActionButtons />
 * </ResponsiveStack>
 */
export function ResponsiveStack({
  children,
  className = '',
  direction = 'vertical',
  gap = 'md',
  align,
  justify,
  as: Tag = 'div',
}: ResponsiveStackProps) {
  const Tag2 = Tag as React.ElementType;
  const classes = [
    directionClasses[direction],
    gapClasses[gap],
    align ? alignClasses[align] : '',
    justify ? justifyClasses[justify] : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Tag2 className={classes}>{children}</Tag2>;
}
