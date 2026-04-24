'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 dark:active:bg-primary-800',
        secondary:
          'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:active:bg-neutral-600',
        ghost:
          'bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
        danger:
          'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 dark:bg-danger-600 dark:hover:bg-danger-700 dark:active:bg-danger-800',
        outline:
          'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
      },
      size: {
        sm: 'h-8  px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean;
  /** Ignored — kept for API compatibility */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, asChild: _asChild, children, ...props }, ref) => (
    <button
      ref={ref}
      className={button({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  )
);

Button.displayName = 'Button';
