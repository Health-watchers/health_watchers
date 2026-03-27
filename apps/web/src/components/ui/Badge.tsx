import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

const badge = cva(
  'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:  'bg-neutral-100 text-neutral-700',
        primary:  'bg-primary-100 text-primary-700',
        success:  'bg-success-50 text-success-700',
        warning:  'bg-warning-50 text-warning-700',
        danger:   'bg-danger-50 text-danger-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ variant, className, children, ...props }: BadgeProps) {
  return (
    <span className={badge({ variant, className })} {...props}>
      {children}
    </span>
  );
}
