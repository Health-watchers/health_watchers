'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BRAND_LABEL,
  cardLabel,
  detectBrand,
  portalPaymentsApi,
  tokenizeCard,
  validateCardForm,
  type SavedCard,
} from '@/lib/portalPayments';

const input =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700';
const btn =
  'rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/** Groups digits as the patient types: 4-4-4-4 (Amex 4-6-5). */
function formatNumber(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 19);
  if (detectBrand(d) === 'amex') return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  return d.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

function AddCardForm({ onAdded, onCancel }: { onAdded: (c: SavedCard) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', number: '', expiry: '', cvc: '', makeDefault: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const problems = validateCardForm(form);
    if (!form.name.trim()) problems.name = 'Enter the name on the card';
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setSaving(true);
    try {
      // The card number is exchanged for a token in the browser and never sent to our API
      const token = await tokenizeCard(form);
      const { data } = await portalPaymentsApi.addCard({
        ...token,
        cardholderName: form.name.trim(),
        makeDefault: form.makeDefault,
      });
      onAdded(data);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: 'name' | 'number' | 'expiry' | 'cvc', label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`card-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <input
        id={`card-${key}`}
        className={input}
        value={form[key]}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `card-${key}-error` : undefined}
        {...props}
      />
      {errors[key] && (
        <p id={`card-${key}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <form aria-label="Add a card" onSubmit={submit} noValidate className="space-y-4">
      {field('name', 'Name on card', {
        autoComplete: 'cc-name',
        onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })),
      })}
      {field('number', 'Card number', {
        inputMode: 'numeric',
        autoComplete: 'cc-number',
        placeholder: '1234 5678 9012 3456',
        onChange: (e) => setForm((f) => ({ ...f, number: formatNumber(e.target.value) })),
      })}
      <div className="grid grid-cols-2 gap-4">
        {field('expiry', 'Expiry (MM/YY)', {
          inputMode: 'numeric',
          autoComplete: 'cc-exp',
          placeholder: 'MM/YY',
          onChange: (e) => setForm((f) => ({ ...f, expiry: formatExpiry(e.target.value) })),
        })}
        {field('cvc', 'Security code', {
          inputMode: 'numeric',
          autoComplete: 'cc-csc',
          placeholder: 'CVC',
          maxLength: 4,
          onChange: (e) => setForm((f) => ({ ...f, cvc: e.target.value.replace(/\D/g, '') })),
        })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.makeDefault}
          onChange={(e) => setForm((f) => ({ ...f, makeDefault: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300"
        />
        Make this my default card
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        🔒 Your card number is sent securely to our payment processor. Health Watchers only stores the
        card type, last four digits and expiry date.
      </p>
      {submitError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={`${btn} border border-gray-300 dark:border-gray-600`} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
          {saving ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </form>
  );
}

export default function PortalPaymentMethodsPage() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setCards(await portalPaymentsApi.cards());
    } catch {
      setNotice({ type: 'error', message: 'We could not load your saved cards.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (card: SavedCard) => {
    setBusy(card._id);
    try {
      await portalPaymentsApi.removeCard(card._id);
      setConfirmRemove(null);
      setNotice({ type: 'success', message: `${cardLabel(card)} removed.` });
      await load();
    } catch (e) {
      setNotice({ type: 'error', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const makeDefault = async (card: SavedCard) => {
    setBusy(card._id);
    try {
      await portalPaymentsApi.setDefault(card._id);
      setCards((prev) => prev.map((c) => ({ ...c, isDefault: c._id === card._id })));
      setNotice({ type: 'success', message: `${cardLabel(card)} is now your default card.` });
    } catch (e) {
      setNotice({ type: 'error', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link href="/portal/payments" className="text-blue-600 hover:underline dark:text-blue-400">
            ← Payments
          </Link>
        </nav>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Payment methods</h1>
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`rounded-md border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200'
              : 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200'
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200">Saved cards</h2>
          {!adding && (
            <button
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500`}
              onClick={() => {
                setNotice(null);
                setAdding(true);
              }}
            >
              Add card
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-4 rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <AddCardForm
              onCancel={() => setAdding(false)}
              onAdded={(card) => {
                setAdding(false);
                setNotice({ type: 'success', message: `${cardLabel(card)} added.` });
                load();
              }}
            />
          </div>
        )}

        {cards.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">You have not saved any cards yet.</p>
        ) : (
          <ul>
            {cards.map((c) => (
              <li
                key={c._id}
                data-testid="saved-card"
                className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {BRAND_LABEL[c.brand]} •••• {c.last4}
                      {c.isDefault && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Expires {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
                      {c.cardholderName && <> · {c.cardholderName}</>}
                      {c.planCount > 0 && (
                        <> · Used by {c.planCount} recurring payment{c.planCount === 1 ? '' : 's'}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!c.isDefault && (
                      <button
                        className={`${btn} border border-gray-300 dark:border-gray-600`}
                        disabled={busy === c._id}
                        onClick={() => makeDefault(c)}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      className={`${btn} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300`}
                      aria-label={`Remove ${cardLabel(c)}`}
                      onClick={() => setConfirmRemove(c._id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {confirmRemove === c._id && (
                  <div
                    role="dialog"
                    aria-labelledby={`remove-${c._id}`}
                    className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-600 dark:bg-gray-900/40"
                  >
                    <p id={`remove-${c._id}`}>
                      Remove {cardLabel(c)}?
                      {c.planCount > 0 &&
                        ' It is used by a recurring payment — move that plan to another card first.'}
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        className={`${btn} border border-gray-300 dark:border-gray-600`}
                        onClick={() => setConfirmRemove(null)}
                      >
                        Keep card
                      </button>
                      <button
                        className={`${btn} bg-red-600 text-white hover:bg-red-700`}
                        disabled={busy === c._id}
                        onClick={() => remove(c)}
                      >
                        {busy === c._id ? 'Removing…' : 'Remove card'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        Choose which card each plan uses on the{' '}
        <Link href="/portal/payments/recurring" className="text-blue-600 hover:underline dark:text-blue-400">
          recurring payments
        </Link>{' '}
        page.
      </p>
    </div>
  );
}
