'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FREQUENCY_LABEL,
  PLAN_STATUS_STYLE,
  cardLabel,
  portalPaymentsApi,
  type PlanHistoryItem,
  type RecurringPlan,
  type SavedCard,
} from '@/lib/portalPayments';

type PendingAction = { planId: string; action: 'pause' | 'resume' | 'cancel' } | null;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

const HISTORY_STYLE: Record<PlanHistoryItem['status'], string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const ACTION_COPY = {
  pause: {
    title: 'Pause this payment?',
    body: 'No payments will be taken until you resume. Missed periods are skipped, not charged later.',
    confirm: 'Pause payments',
    done: 'Recurring payment paused.',
  },
  resume: {
    title: 'Resume this payment?',
    body: 'Payments restart on the next scheduled date.',
    confirm: 'Resume payments',
    done: 'Recurring payment resumed.',
  },
  cancel: {
    title: 'Cancel this payment?',
    body: 'This stops all future payments for this plan and cannot be undone. Contact your clinic to set up a new plan.',
    confirm: 'Cancel plan',
    done: 'Recurring payment cancelled.',
  },
} as const;

const btn =
  'rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

function PlanHistory({ planId }: { planId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PlanHistoryItem[]; meta: { pages: number; total: number } }>();
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    portalPaymentsApi
      .history(planId, page)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [planId, page]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading history…</p>;
  if (data.items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No payments have been taken yet.</p>;
  }

  return (
    <div>
      <table className="w-full text-sm" aria-label="Payment history">
        <thead className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th scope="col" className="py-1.5">Date</th>
            <th scope="col" className="py-1.5">Amount</th>
            <th scope="col" className="py-1.5">Status</th>
            <th scope="col" className="py-1.5">Reference</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((h, i) => (
            <tr key={`${h.intentId ?? i}-${h.date}`} className="border-t border-gray-100 dark:border-gray-700">
              <td className="py-1.5">{fmtDate(h.date)}</td>
              <td className="py-1.5 tabular-nums">
                {h.amount} {h.currency}
              </td>
              <td className="py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HISTORY_STYLE[h.status]}`}>
                  {h.status}
                </span>
                {h.failureReason && (
                  <span className="block text-xs text-red-600 dark:text-red-400">{h.failureReason}</span>
                )}
              </td>
              <td className="max-w-[10rem] truncate py-1.5 font-mono text-xs text-gray-500">
                {h.transactionHash ?? h.intentId ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.meta.pages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs">
          <button
            className={`${btn} border border-gray-200 dark:border-gray-600`}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Newer
          </button>
          <span>
            Page {page} of {data.meta.pages}
          </span>
          <button
            className={`${btn} border border-gray-200 dark:border-gray-600`}
            disabled={page >= data.meta.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Older
          </button>
        </div>
      )}
    </div>
  );
}

export default function PortalRecurringPaymentsPage() {
  const [plans, setPlans] = useState<RecurringPlan[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [p, c] = await Promise.all([
        portalPaymentsApi.plans(),
        portalPaymentsApi.cards().catch(() => [] as SavedCard[]),
      ]);
      setPlans(p);
      setCards(c);
    } catch {
      setLoadError('We could not load your recurring payments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replacePlan = (updated: RecurringPlan) =>
    setPlans((prev) => prev.map((p) => (p._id === updated._id ? { ...p, ...updated } : p)));

  const confirmAction = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { data, meta } = await portalPaymentsApi.changeStatus(
        pending.planId,
        pending.action,
        reason.trim() || undefined
      );
      replacePlan(data);
      setNotice({
        type: 'success',
        message: `${ACTION_COPY[pending.action].done}${
          meta?.emailSent ? ' A confirmation email is on its way.' : ''
        }`,
      });
      setPending(null);
      setReason('');
    } catch (e) {
      setNotice({ type: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const changeCard = async (planId: string, cardId: string) => {
    try {
      const { data } = await portalPaymentsApi.assignCard(planId, cardId);
      replacePlan(data);
      setNotice({ type: 'success', message: 'Payment card updated. A confirmation email is on its way.' });
    } catch (e) {
      setNotice({ type: 'error', message: (e as Error).message });
    }
  };

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;

  const open = plans.filter((p) => p.status === 'active' || p.status === 'paused');
  const closed = plans.filter((p) => p.status === 'cancelled' || p.status === 'completed');

  const renderPlan = (plan: RecurringPlan) => {
    const isPending = pending?.planId === plan._id;
    const isOpen = plan.status === 'active' || plan.status === 'paused';
    return (
      <li
        key={plan._id}
        data-testid="recurring-plan"
        className="border-b border-gray-100 py-4 last:border-0 dark:border-gray-700"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {plan.description || 'Recurring payment'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="tabular-nums">
                {plan.amount} {plan.currency}
              </span>{' '}
              · {FREQUENCY_LABEL[plan.frequency] ?? plan.frequency}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {plan.status === 'active' && <>Next payment {fmtDate(plan.nextPaymentDate)} · </>}
              {plan.status === 'paused' && <>Paused {fmtDate(plan.pausedAt)} · </>}
              {plan.status === 'cancelled' && <>Cancelled {fmtDate(plan.cancelledAt)} · </>}
              {plan.paymentsMade} payment{plan.paymentsMade === 1 ? '' : 's'} made
              {plan.endDate && <> · Ends {fmtDate(plan.endDate)}</>}
            </p>
            {plan.failureCount > 0 && plan.status !== 'cancelled' && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {plan.failureCount} recent payment attempt{plan.failureCount === 1 ? '' : 's'} failed.
                Check your payment card.
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PLAN_STATUS_STYLE[plan.status]}`}
          >
            {plan.status}
          </span>
        </div>

        {isOpen && cards.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`card-${plan._id}`} className="text-gray-600 dark:text-gray-300">
              Pay with
            </label>
            <select
              id={`card-${plan._id}`}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
              value={plan.paymentMethodId ?? ''}
              onChange={(e) => e.target.value && changeCard(plan._id, e.target.value)}
            >
              {!plan.paymentMethodId && <option value="">Choose a card…</option>}
              {cards.map((c) => (
                <option key={c._id} value={c._id}>
                  {cardLabel(c)}
                  {c.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {plan.status === 'active' && (
            <button
              className={`${btn} border border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30`}
              onClick={() => setPending({ planId: plan._id, action: 'pause' })}
            >
              Pause
            </button>
          )}
          {plan.status === 'paused' && (
            <button
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500`}
              onClick={() => setPending({ planId: plan._id, action: 'resume' })}
            >
              Resume
            </button>
          )}
          {isOpen && (
            <button
              className={`${btn} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30`}
              onClick={() => setPending({ planId: plan._id, action: 'cancel' })}
            >
              Cancel plan
            </button>
          )}
          <button
            className={`${btn} text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-gray-700`}
            aria-expanded={expanded === plan._id}
            aria-controls={`history-${plan._id}`}
            onClick={() => setExpanded((id) => (id === plan._id ? null : plan._id))}
          >
            {expanded === plan._id ? 'Hide history' : 'Payment history'}
          </button>
        </div>

        {isPending && pending && (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby={`confirm-${plan._id}`}
            className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900/40"
          >
            <p id={`confirm-${plan._id}`} className="font-medium">
              {ACTION_COPY[pending.action].title}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{ACTION_COPY[pending.action].body}</p>
            {pending.action !== 'resume' && (
              <div className="mt-3">
                <label htmlFor={`reason-${plan._id}`} className="block text-sm text-gray-700 dark:text-gray-200">
                  Reason (optional)
                </label>
                <textarea
                  id={`reason-${plan._id}`}
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                className={`${btn} border border-gray-300 dark:border-gray-600`}
                onClick={() => {
                  setPending(null);
                  setReason('');
                }}
                disabled={busy}
              >
                Keep plan
              </button>
              <button
                className={`${btn} ${
                  pending.action === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
                onClick={confirmAction}
                disabled={busy}
              >
                {busy ? 'Saving…' : ACTION_COPY[pending.action].confirm}
              </button>
            </div>
          </div>
        )}

        {expanded === plan._id && (
          <div id={`history-${plan._id}`} className="mt-3">
            <PlanHistory planId={plan._id} />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link href="/portal/payments" className="text-blue-600 hover:underline dark:text-blue-400">
              ← Payments
            </Link>
          </nav>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Recurring payments</h1>
        </div>
        <Link
          href="/portal/payments/methods"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Manage cards
        </Link>
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200'
              : 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200'
          }`}
        >
          <span>{notice.message}</span>
          <button aria-label="Dismiss" onClick={() => setNotice(null)} className="text-current opacity-70">
            ×
          </button>
        </div>
      )}

      {loadError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}{' '}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-1 font-semibold text-gray-700 dark:text-gray-200">Active plans</h2>
            {open.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                You have no active recurring payments. Your clinic can set up a payment plan for you.
              </p>
            ) : (
              <ul>{open.map(renderPlan)}</ul>
            )}
          </section>

          {closed.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-1 font-semibold text-gray-700 dark:text-gray-200">Past plans</h2>
              <ul>{closed.map(renderPlan)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
