import { cva, type VariantProps } from 'class-variance-authority';

const spinner = cva('animate-spin rounded-full border-2 border-current border-t-transparent', {
  variants: {
    size: {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps extends VariantProps<typeof spinner> {
  className?: string;
  label?: string;
}

export function Spinner({ size, className, label = 'Loading…' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <span className={spinner({ size, className })} />
    </span>
  );
}
