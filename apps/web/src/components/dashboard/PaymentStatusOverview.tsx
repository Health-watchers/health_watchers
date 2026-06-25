import Link from 'next/link';
import { Card } from '@/components/ui';

interface PaymentRecord {
  _id: string;
  intentId: string;
  amount: string;
  assetCode: string;
  confirmedAt?: string;
  txHash?: string;
}

interface PaymentStatusData {
  pending: number;
  confirmed: number;
  failed: number;
  recentConfirmed: PaymentRecord[];
}

interface PaymentStatusOverviewProps {
  data: PaymentStatusData;
}

const total = (d: PaymentStatusData) => d.pending + d.confirmed + d.failed || 1;
const pct = (n: number, d: PaymentStatusData) => Math.round((n / total(d)) * 100);

export function PaymentStatusOverview({ data }: PaymentStatusOverviewProps) {
  return (
    <Card className="flex flex-col gap-4 p-4" role="region" aria-label="Payment status overview">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          💳 Payment Status
        </h2>
        <Link
          href="/payments"
          className="text-xs text-primary-600 hover:underline focus:outline-none focus-visible:underline"
          aria-label="View all payments"
        >
          View all
        </Link>
      </div>

      {/* Stacked progress bar */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
        role="img"
        aria-label={`Payments: ${data.confirmed} confirmed, ${data.pending} pending, ${data.failed} failed`}
      >
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${pct(data.confirmed, data)}%` }}
        />
        <div
          className="bg-yellow-400 transition-all"
          style={{ width: `${pct(data.pending, data)}%` }}
        />
        <div
          className="bg-red-400 transition-all"
          style={{ width: `${pct(data.failed, data)}%` }}
        />
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Confirmed', value: data.confirmed, color: 'text-green-600' },
          { label: 'Pending', value: data.pending, color: 'text-yellow-600' },
          { label: 'Failed', value: data.failed, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md bg-neutral-50 p-2 dark:bg-neutral-800">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent confirmed */}
      {data.recentConfirmed.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Recent Confirmed
          </p>
          <ul className="space-y-1.5" aria-label="Recently confirmed payments">
            {data.recentConfirmed.map((p) => (
              <li
                key={p._id}
                className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-1.5 text-sm dark:bg-neutral-800"
              >
                <span className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {p.intentId.slice(0, 10)}…
                </span>
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {p.amount} {p.assetCode}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
