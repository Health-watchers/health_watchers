'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AssetSelector, Badge, Button, ErrorMessage, Spinner } from '@/components/ui';
import { useFeeEstimate } from '@/hooks/useFeeEstimate';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { webConfig } from '@/lib/config';
import { queryKeys } from '@/lib/queryKeys';
import { downloadCsv, getStellarExplorerUrl, isValidStellarPublicKey, parseCsv } from '@/lib/utils';

const MAX_PAYMENTS = 100; // enforced by createBatchPaymentSchema
const MAX_MEMO = 28;
const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

const CSV_TEMPLATE =
  'destination,amount,memo\nGBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H,25.50,Provider payout';

type Field = 'destination' | 'amount' | 'memo';
type Mapping = Record<Field, number | ''>;
type Asset = 'XLM' | 'USDC';
type ItemStatus = 'pending' | 'success' | 'failed';

interface PaymentInstruction {
  destination: string;
  amount: string;
  memo?: string;
}

interface PreviewRow extends PaymentInstruction {
  row: number; // 1-based CSV line, header excluded
  errors: string[];
}

interface BatchItem extends PaymentInstruction {
  status?: string;
  failureReason?: string;
  txHash?: string;
}

interface Batch {
  batchId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  currency: Asset;
  totalAmount: string;
  payments: BatchItem[];
  txHash?: string;
  failureReason?: string;
}

const FIELD_HINTS: Record<Field, string[]> = {
  destination: ['destination', 'address', 'account', 'wallet', 'public key', 'publickey'],
  amount: ['amount', 'value', 'sum', 'payout'],
  memo: ['memo', 'note', 'reference', 'description'],
};

function guessMapping(headers: string[]): Mapping {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (field: Field) => {
    const i = lower.findIndex((h) => FIELD_HINTS[field].some((hint) => h.includes(hint)));
    return i === -1 ? '' : i;
  };
  return { destination: find('destination'), amount: find('amount'), memo: find('memo') };
}

function validateRows(rows: string[][], mapping: Mapping): PreviewRow[] {
  const seen = new Map<string, number>();
  return rows.map((cells, i) => {
    const destination = mapping.destination === '' ? '' : (cells[mapping.destination] ?? '').trim();
    const amount = mapping.amount === '' ? '' : (cells[mapping.amount] ?? '').trim();
    const memo = mapping.memo === '' ? '' : (cells[mapping.memo] ?? '').trim();
    const errors: string[] = [];

    if (!destination) errors.push('Missing destination');
    else if (!isValidStellarPublicKey(destination)) errors.push('Invalid Stellar address');
    else if (seen.has(destination)) errors.push(`Duplicate of row ${seen.get(destination)}`);
    else seen.set(destination, i + 1);

    if (!AMOUNT_RE.test(amount) || Number(amount) <= 0)
      errors.push('Amount must be positive, max 7 decimals');
    if (memo.length > MAX_MEMO) errors.push(`Memo over ${MAX_MEMO} chars`);

    return { row: i + 1, destination, amount, ...(memo ? { memo } : {}), errors };
  });
}

/** Sum of decimal strings without float drift (Stellar uses 7 decimal places). */
function sumAmounts(amounts: string[]): string {
  const total = amounts.reduce((acc, a) => {
    const [whole, frac = ''] = a.split('.');
    return acc + BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0'));
  }, 0n);
  const whole = total / 10_000_000n;
  const frac = (total % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function itemStatus(item: BatchItem, batch: Batch): ItemStatus {
  // Prefer per-item status if the API provides it; otherwise the whole batch is one transaction
  const s = item.status ?? batch.status;
  if (s === 'confirmed' || s === 'success' || s === 'completed') return 'success';
  if (s === 'failed') return 'failed';
  return 'pending';
}

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.message ?? `${fallback} (${res.status})`);
}

async function submitBatch(payments: PaymentInstruction[], currency: Asset): Promise<Batch> {
  const res = await fetchWithAuth(`${API_V1}/payments/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payments, currency }),
  });
  if (!res.ok) throw await readError(res, 'Failed to submit batch');
  const body = await res.json();
  return body.data;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ['Upload', 'Map & validate', 'Confirm', 'Progress'];
  return (
    <ol className="flex flex-wrap gap-2 text-xs" aria-label="Batch payment steps">
      {steps.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? 'step' : undefined}
          className={`rounded-full px-3 py-1 ${
            i === step
              ? 'bg-primary-500 text-white'
              : i < step
                ? 'bg-primary-100 text-primary-700'
                : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function BatchProgress({
  batchId,
  onRetry,
  retrying,
}: {
  batchId: string;
  onRetry: (failed: PaymentInstruction[], currency: Asset) => void;
  retrying: boolean;
}) {
  const [filter, setFilter] = useState<'all' | ItemStatus>('all');
  const { data: batch, error, refetch } = useQuery<Batch>({
    queryKey: queryKeys.batchPayments.detail(batchId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/payments/batch/${encodeURIComponent(batchId)}`);
      if (!res.ok) throw await readError(res, 'Failed to load batch');
      const body = await res.json();
      return body.data;
    },
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'confirmed' || s === 'failed' ? false : 3000;
    },
  });

  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />;
  if (!batch) {
    return (
      <div role="status" className="flex items-center gap-2 text-neutral-500">
        <Spinner size="sm" /> Loading batch {batchId.slice(0, 8)}…
      </div>
    );
  }

  const items = batch.payments.map((p) => ({ ...p, itemStatus: itemStatus(p, batch) }));
  const counts = {
    success: items.filter((i) => i.itemStatus === 'success').length,
    failed: items.filter((i) => i.itemStatus === 'failed').length,
    pending: items.filter((i) => i.itemStatus === 'pending').length,
  };
  const failed = items.filter((i) => i.itemStatus === 'failed');
  const visible = filter === 'all' ? items : items.filter((i) => i.itemStatus === filter);
  const done = counts.pending === 0;
  const pct = Math.round(((counts.success + counts.failed) / Math.max(items.length, 1)) * 100);

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-800">
            Batch <span className="font-mono">{batch.batchId.slice(0, 8)}</span> ·{' '}
            {batch.totalAmount} {batch.currency}
          </p>
          <p className="text-xs text-neutral-500" aria-live="polite">
            {counts.success} succeeded · {counts.failed} failed · {counts.pending} pending
          </p>
        </div>
        {batch.txHash && (
          <a
            href={getStellarExplorerUrl(batch.txHash, 'tx', webConfig.stellar.network)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline"
          >
            View transaction ↗
          </a>
        )}
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Batch progress"
      >
        <div className="flex h-full" style={{ width: `${pct}%` }}>
          <div className="bg-success-500 h-full" style={{ flex: counts.success }} />
          <div className="bg-danger-500 h-full" style={{ flex: counts.failed }} />
        </div>
      </div>

      {batch.failureReason && counts.failed > 0 && (
        <p className="text-danger-600 text-sm" role="alert">
          {batch.failureReason}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Filter items">
          {(['all', 'success', 'failed', 'pending'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-xs capitalize ${
                filter === f ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {f} {f !== 'all' && `(${counts[f]})`}
            </button>
          ))}
        </div>
        {done && failed.length > 0 && (
          <Button
            size="sm"
            loading={retrying}
            onClick={() =>
              onRetry(
                failed.map(({ destination, amount, memo }) => ({
                  destination,
                  amount,
                  ...(memo ? { memo } : {}),
                })),
                batch.currency
              )
            }
          >
            Retry {failed.length} failed
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-2 pr-3">Recipient</th>
              <th scope="col" className="py-2 pr-3">Amount</th>
              <th scope="col" className="py-2 pr-3">Memo</th>
              <th scope="col" className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item, i) => (
              <tr key={`${item.destination}-${i}`} className="border-t border-neutral-100">
                <td className="py-2 pr-3 font-mono text-xs" title={item.destination}>
                  {item.destination.slice(0, 6)}…{item.destination.slice(-6)}
                </td>
                <td className="py-2 pr-3">{item.amount}</td>
                <td className="py-2 pr-3 text-xs text-neutral-500">{item.memo ?? '—'}</td>
                <td className="py-2">
                  {item.itemStatus === 'success' && <Badge variant="success">success</Badge>}
                  {item.itemStatus === 'pending' && <Badge variant="warning">pending</Badge>}
                  {item.itemStatus === 'failed' && (
                    <span className="flex flex-col">
                      <Badge variant="danger">failed</Badge>
                      {item.failureReason && (
                        <span className="text-danger-600 mt-0.5 text-xs">{item.failureReason}</span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function BatchPaymentsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ destination: '', amount: '', memo: '' });
  const [currency, setCurrency] = useState<Asset>('XLM');
  const [parseError, setParseError] = useState('');
  const [batchIds, setBatchIds] = useState<string[]>([]);

  const fee = useFeeEstimate();

  const preview = useMemo(() => validateRows(dataRows, mapping), [dataRows, mapping]);
  const validRows = preview.filter((r) => r.errors.length === 0);
  const invalidRows = preview.filter((r) => r.errors.length > 0);
  const toSubmit: PaymentInstruction[] = validRows.map(({ destination, amount, memo }) => ({
    destination,
    amount,
    ...(memo ? { memo } : {}),
  }));
  const total = toSubmit.length ? sumAmounts(toSubmit.map((p) => p.amount)) : '0';
  // One payment operation per recipient, all in a single transaction
  const perOpFee = fee.data ? Number(fee.data.standard.xlm) : null;
  const totalFee = perOpFee !== null ? (perOpFee * toSubmit.length).toFixed(7) : null;

  const submit = useMutation({
    mutationFn: ({ payments, asset }: { payments: PaymentInstruction[]; asset: Asset }) =>
      submitBatch(payments, asset),
    onSuccess: (batch) => {
      setBatchIds((ids) => [batch.batchId, ...ids]);
      setStep(3);
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV needs a header row and at least one payment.');
      if (rows.length - 1 > MAX_PAYMENTS)
        throw new Error(`A batch can hold at most ${MAX_PAYMENTS} payments.`);
      setFileName(file.name);
      setHeaders(rows[0]);
      setDataRows(rows.slice(1));
      setMapping(guessMapping(rows[0]));
      setStep(1);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read the CSV file.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const reset = () => {
    setStep(0);
    setHeaders([]);
    setDataRows([]);
    setFileName('');
    submit.reset();
  };

  return (
    <section aria-labelledby="batch-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="batch-heading" className="text-lg font-semibold text-neutral-900">
            Batch payouts
          </h2>
          <p className="text-sm text-neutral-500">
            Pay up to {MAX_PAYMENTS} Stellar accounts in one transaction.
          </p>
        </div>
        <StepIndicator step={step} />
      </div>

      {step === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => downloadCsv(CSV_TEMPLATE, 'batch-payments-template.csv')}
            >
              Download template
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600">
              Upload CSV
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFile}
                aria-label="Upload batch payments CSV"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Columns: recipient Stellar address, amount, and an optional memo (max {MAX_MEMO}{' '}
            characters). You can map columns after uploading.
          </p>
          {parseError && (
            <p className="text-danger-600 mt-3 text-sm" role="alert">
              {parseError}
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-4">
            {(['destination', 'amount', 'memo'] as const).map((field) => (
              <label key={field} className="flex flex-col gap-1 text-sm">
                <span className="font-medium capitalize text-neutral-700">
                  {field === 'destination' ? 'Recipient address' : field}
                  {field !== 'memo' && ' *'}
                </span>
                <select
                  value={mapping[field]}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [field]: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  className="rounded-md border border-neutral-200 px-2 py-2 text-sm"
                >
                  <option value="">{field === 'memo' ? '— none —' : '— select column —'}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <AssetSelector
              id="batch-asset"
              label="Asset"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Asset)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-neutral-600">{fileName}</span>
            <Badge variant="success">{validRows.length} valid</Badge>
            {invalidRows.length > 0 && (
              <Badge variant="danger">{invalidRows.length} need attention</Badge>
            )}
          </div>

          <div className="max-h-96 overflow-auto rounded-lg border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Row</th>
                  <th scope="col" className="px-3 py-2">Recipient</th>
                  <th scope="col" className="px-3 py-2">Amount</th>
                  <th scope="col" className="px-3 py-2">Memo</th>
                  <th scope="col" className="px-3 py-2">Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => {
                  const bad = r.errors.length > 0;
                  const badAddress = r.errors.some(
                    (e) => e.includes('address') || e.includes('destination')
                  );
                  return (
                    <tr
                      key={r.row}
                      className={`border-t border-neutral-100 ${bad ? 'bg-danger-50' : ''}`}
                    >
                      <td className="px-3 py-2 text-neutral-500">{r.row}</td>
                      <td
                        className={`break-all px-3 py-2 font-mono text-xs ${
                          badAddress ? 'text-danger-700 underline decoration-wavy' : ''
                        }`}
                      >
                        {r.destination || '—'}
                      </td>
                      <td className="px-3 py-2">{r.amount || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.memo ?? ''}</td>
                      <td className="px-3 py-2 text-xs">
                        {bad ? (
                          <span className="text-danger-700">{r.errors.join('; ')}</span>
                        ) : (
                          <span className="text-success-700">✓ Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={reset}>
              Upload a different file
            </Button>
            <div className="flex items-center gap-3">
              {invalidRows.length > 0 && validRows.length > 0 && (
                <span className="text-xs text-neutral-500">
                  Invalid rows will be excluded from the batch.
                </span>
              )}
              <Button disabled={validRows.length === 0} onClick={() => setStep(2)}>
                Continue with {validRows.length} payment{validRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-lg space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="text-base font-semibold text-neutral-900">Confirm batch payout</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-neutral-500">Recipients</dt>
            <dd className="text-right font-medium">{toSubmit.length}</dd>
            <dt className="text-neutral-500">Total amount</dt>
            <dd className="text-right text-lg font-semibold">
              {total} {currency}
            </dd>
            <dt className="text-neutral-500">Estimated network fee</dt>
            <dd className="text-right">
              {fee.isLoading ? (
                <Spinner size="sm" />
              ) : totalFee ? (
                `${totalFee} XLM`
              ) : (
                <span className="text-xs text-neutral-500">Unavailable — network default</span>
              )}
            </dd>
            {invalidRows.length > 0 && (
              <>
                <dt className="text-neutral-500">Excluded rows</dt>
                <dd className="text-danger-600 text-right">{invalidRows.length}</dd>
              </>
            )}
            <dt className="text-neutral-500">Network</dt>
            <dd className="text-right capitalize">{webConfig.stellar.network}</dd>
          </dl>
          {perOpFee !== null && (
            <p className="text-xs text-neutral-500">
              {fee.data?.standard.xlm} XLM per operation × {toSubmit.length} operations (standard
              speed, ~{fee.data?.standard.confirmationTime}).
            </p>
          )}
          {submit.error && (
            <p className="text-danger-600 text-sm" role="alert">
              {(submit.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStep(1)} disabled={submit.isPending}>
              Back
            </Button>
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ payments: toSubmit, asset: currency })}
            >
              Send {total} {currency}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {submit.error && (
            <p className="text-danger-600 text-sm" role="alert">
              {(submit.error as Error).message}
            </p>
          )}
          {batchIds.map((id) => (
            <BatchProgress
              key={id}
              batchId={id}
              retrying={submit.isPending}
              onRetry={(payments, asset) => submit.mutate({ payments, asset })}
            />
          ))}
          <Button variant="outline" onClick={reset}>
            Start a new batch
          </Button>
        </div>
      )}
    </section>
  );
}
