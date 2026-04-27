import type { PreAuth } from '@/lib/queries/usePreAuth';

const statusConfig: Record<
  PreAuth['status'],
  { label: string; className: string }
> = {
  pending:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800' },
  approved:  { label: 'Approved',  className: 'bg-blue-100 text-blue-800' },
  denied:    { label: 'Denied',    className: 'bg-red-100 text-red-800' },
  claimed:   { label: 'Claimed',   className: 'bg-green-100 text-green-800' },
  reclaimed: { label: 'Reclaimed', className: 'bg-gray-100 text-gray-700' },
};

export function PreAuthStatusBadge({ status }: { status: PreAuth['status'] }) {
  const { label, className } = statusConfig[status] ?? statusConfig.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
