import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-neutral-200">
      <table className={['w-full text-sm text-neutral-700', className ?? ''].join(' ')} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={['border-b border-neutral-200 bg-neutral-50', className ?? ''].join(' ')}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={['divide-y divide-neutral-100', className ?? ''].join(' ')} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={['transition-colors hover:bg-neutral-50', className ?? ''].join(' ')} {...props}>
      {children}
    </tr>
  );
}

export function TableTh({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={[
        'px-4 py-3 text-left text-xs font-semibold tracking-wide text-neutral-500 uppercase',
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableTd({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={['px-4 py-3 text-neutral-700', className ?? ''].join(' ')} {...props}>
      {children}
    </td>
  );
}
