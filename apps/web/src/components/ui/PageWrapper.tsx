import type { HTMLAttributes, ReactNode } from 'react';

export function PageWrapper({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <main
      className={['mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className ?? ''].join(' ')}
      {...props}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['flex items-start justify-between gap-4', className ?? ''].join(' ')}>
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
