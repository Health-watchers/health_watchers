import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900',
        paddingMap[padding],
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['mb-4 flex items-center justify-between', className ?? ''].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={['text-lg font-semibold text-neutral-800', className ?? ''].join(' ')}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
