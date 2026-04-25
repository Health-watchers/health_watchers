'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { queryKeys } from '@/lib/queryKeys';
import { getStellarExplorerUrl } from '@/lib/stellar';
import {
  PageWrapper,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Modal,
  Toast,
  Spinner,
  ErrorMessage,
  StellarAddressDisplay,
} from '@/components/ui';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const IS_TESTNET = NETWORK === 'testnet';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Transaction {
  id: string;
  type: string;
  amount: string;
  asset: string;
  from: string;
  to: string;
  hash: string;
  createdAt: string;
}

interface WalletBalance {
  publicKey: string;
  balance: string;
  xlmBalance?: string;
  usdcBalance: string | null;
  usdcIssuer?: string;
  transactions: Transaction[];
}

interface BalanceSnapshot {
  date: string;
  xlmBalance: string;
  usdcBalance: string | null;
}

interface BalanceAlerts {
  lowBalanceWarningXlm: number;
  criticalBalanceXlm: number;
  largeTransactionXlm: number;
  alertsEnabled: boolean;
}

function useWalletBalance() {
  return useQuery<WalletBalance>({
    queryKey: queryKeys.wallet.balance(),
    queryFn: async () => {
      const res = await fetch('/api/payments/balance');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
    retry: 1,
  });
}

function useBalanceSnapshots() {
  return useQuery<BalanceSnapshot[]>({
    queryKey: queryKeys.wallet.snapshots(),
    queryFn: async () => {
      const res = await fetch('/api/payments/balance-snapshots');
      if (!res.ok) return [];
      const body = await res.json();
      return body.data ?? [];
    },
    retry: 1,
  });
}

function useBalanceAlerts() {
  return useQuery<BalanceAlerts>({
    queryKey: ['wallet', 'alert-settings'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/settings`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load settings');
      const body = await res.json();
      return body.data?.balanceAlerts ?? {
        lowBalanceWarningXlm: 100,
        criticalBalanceXlm: 10,
        largeTransactionXlm: 1000,
        alertsEnabled: true,
      };
    },
  });
}

interface SendPaymentFormProps {
  balance: string;
  onSubmit: (data: { destination: string; amount: string; memo?: string }) => void;
  onCancel: () => void;
  loading: boolean;
}

function SendPaymentForm({ balance, onSubmit, onCancel, loading }: SendPaymentFormProps) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!destination.trim()) e.destination = 'Destination is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Enter a valid amount';
    else if (Number(amount) > Number(balance))
      e.amount = `Insufficient balance (${balance} XLM available)`;
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSubmit({ destination: destination.trim(), amount, memo: memo.trim() || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Destination Public Key"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder="G..."
        error={errors.destination}
      />
      <Input
        label="Amount (XLM)"
        type="number"
        min="0.0000001"
        step="any"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        helperText={`Available: ${balance} XLM`}
        error={errors.amount}
      />
      <Input
        label="Memo (optional)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="Payment reference"
      />
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          Review Payment
        </Button>
      </div>
    </form>
  );
}

interface ConfirmPaymentModalProps {
  open: boolean;
  data: { destination: string; amount: string; memo?: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmPaymentModal({
  open,
  data,
  onConfirm,
  onCancel,
  loading,
}: ConfirmPaymentModalProps) {
  if (!data) return null;
  return (
    <Modal open={open} onClose={onCancel} title="Confirm Payment" size="sm">
      <div className="flex flex-col gap-3 text-sm text-neutral-700">
        <div className="flex justify-between">
          <span className="text-neutral-500">To</span>
          <StellarAddressDisplay value={data.destination} />
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Amount</span>
          <span className="font-semibold">{data.amount} XLM</span>
        </div>
        {data.memo && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Memo</span>
            <span>{data.memo}</span>
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={loading}>
          Send Payment
        </Button>
      </div>
    </Modal>
  );
}

function BalanceTrendChart({ snapshots }: { snapshots: BalanceSnapshot[] }) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-neutral-500">
        No balance history yet. Data will appear after the first monitoring cycle.
      </p>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    xlm: parseFloat(s.xlmBalance),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={50} />
        <Tooltip formatter={(v: number) => [`${v.toFixed(2)} XLM`, 'Balance']} />
        <Line
          type="monotone"
          dataKey="xlm"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AlertThresholdSettings({
  settings,
  onSave,
  saving,
}: {
  settings: BalanceAlerts;
  onSave: (data: BalanceAlerts) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BalanceAlerts>(settings);

  const handleChange = (key: keyof BalanceAlerts, value: number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <input
          id="alertsEnabled"
          type="checkbox"
          checked={form.alertsEnabled}
          onChange={(e) => handleChange('alertsEnabled', e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-primary-600"
        />
        <label htmlFor="alertsEnabled" className="text-sm font-medium text-neutral-700">
          Enable balance alerts
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label="Low Balance Warning (XLM)"
          type="number"
          min="0"
          step="1"
          value={String(form.lowBalanceWarningXlm)}
          onChange={(e) => handleChange('lowBalanceWarningXlm', Number(e.target.value))}
          helperText="Alert when balance drops below this"
          disabled={!form.alertsEnabled}
        />
        <Input
          label="Critical Balance (XLM)"
          type="number"
          min="0"
          step="1"
          value={String(form.criticalBalanceXlm)}
          onChange={(e) => handleChange('criticalBalanceXlm', Number(e.target.value))}
          helperText="Critical alert threshold"
          disabled={!form.alertsEnabled}
        />
        <Input
          label="Large Transaction (XLM)"
          type="number"
          min="0"
          step="1"
          value={String(form.largeTransactionXlm)}
          onChange={(e) => handleChange('largeTransactionXlm', Number(e.target.value))}
          helperText="Alert for transactions above this"
          disabled={!form.alertsEnabled}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!form.alertsEnabled && !settings.alertsEnabled}>
          Save Alert Settings
        </Button>
      </div>
    </form>
  );
}

export default function WalletClient() {
  const queryClient = useQueryClient();
  const { data: wallet, isLoading, error, refetch } = useWalletBalance();
  const { data: snapshots } = useBalanceSnapshots();
  const { data: alertSettings } = useBalanceAlerts();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSendForm, setShowSendForm] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    destination: string;
    amount: string;
    memo?: string;
  } | null>(null);

  const saveAlertsMutation = useMutation({
    mutationFn: async (data: BalanceAlerts) => {
      const res = await fetch(`${API}/api/v1/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceAlerts: data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setToast({ message: 'Alert settings saved.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'alert-settings'] });
    },
    onError: (err: Error) => {
      setToast({ message: err.message, type: 'error' });
    },
  });

  const fundMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payments/fund', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setToast({
        message: 'Account funded successfully! Balance will update shortly.',
        type: 'success',
      });
      // Delay refetch to allow Horizon to index the transaction
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() }),
        3000
      );
    },
    onError: (err: Error) => {
      setToast({ message: err.message, type: 'error' });
    },
  });

  const trustlineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payments/trustline', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setToast({ message: 'USDC trustline created successfully!', type: 'success' });
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() }),
        2000
      );
    },
    onError: (err: Error) => {
      setToast({ message: err.message, type: 'error' });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { destination: string; amount: string; memo?: string }) => {
      const res = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, assetCode: 'XLM' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setPendingPayment(null);
      setShowSendForm(false);
      setToast({ message: 'Payment initiated successfully.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
    onError: (err: Error) => {
      setPendingPayment(null);
      setToast({ message: err.message, type: 'error' });
    },
  });

  return (
    <PageWrapper className="space-y-6 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Wallet" subtitle="Manage your clinic's Stellar account" />

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 py-12 text-neutral-500"
        >
          <Spinner />
          <span>Loading wallet...</span>
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}

      {wallet && (
        <>
          {/* Account Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Account Overview</CardTitle>
              <Badge variant={IS_TESTNET ? 'warning' : 'success'}>
                {IS_TESTNET ? 'Testnet' : 'Mainnet'}
              </Badge>
            </CardHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="shrink-0 text-sm text-neutral-500">Public Key</span>
                <StellarAddressDisplay value={wallet.publicKey} className="text-sm" />
                <span className="hidden truncate font-mono text-xs text-neutral-500 sm:block">
                  {wallet.publicKey}
                </span>
              </div>

              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-neutral-900 tabular-nums">
                  {parseFloat(wallet.balance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}
                </span>
                <span className="mb-1 text-lg text-neutral-500">XLM</span>
              </div>

              {wallet.usdcBalance !== null && wallet.usdcBalance !== undefined ? (
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-semibold text-neutral-700 tabular-nums">
                    {parseFloat(wallet.usdcBalance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="mb-0.5 text-base text-neutral-500">USDC</span>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  No USDC trustline — create one to receive USDC payments.
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  onClick={() => setShowSendForm(true)}
                  disabled={parseFloat(wallet.balance) <= 0}
                >
                  Send Payment
                </Button>
                {IS_TESTNET && (
                  <Button
                    variant="outline"
                    onClick={() => fundMutation.mutate()}
                    loading={fundMutation.isPending}
                    disabled={fundMutation.isSuccess}
                    title={
                      fundMutation.isSuccess
                        ? 'Already funded this session'
                        : 'Fund with Friendbot (testnet only)'
                    }
                  >
                    {fundMutation.isSuccess ? '✓ Funded' : 'Fund with Friendbot'}
                  </Button>
                )}
                {wallet.usdcBalance === null && (
                  <Button
                    variant="outline"
                    onClick={() => trustlineMutation.mutate()}
                    loading={trustlineMutation.isPending}
                    title="Create USDC trustline to receive USDC payments"
                  >
                    Enable USDC
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Send Payment Form */}
          {showSendForm && !pendingPayment && (
            <Card>
              <CardHeader>
                <CardTitle>Send Payment</CardTitle>
              </CardHeader>
              <SendPaymentForm
                balance={wallet.balance}
                onSubmit={(data) => {
                  setPendingPayment(data);
                  setShowSendForm(false);
                }}
                onCancel={() => setShowSendForm(false)}
                loading={false}
              />
            </Card>
          )}

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <span className="text-xs text-neutral-500">Last 10</span>
            </CardHeader>

            {wallet.transactions.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-500">No transactions yet.</p>
            ) : (
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="px-6 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Amount
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        From / To
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Date
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                        Tx
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {wallet.transactions.map((tx) => {
                      const isIncoming = tx.to === wallet.publicKey;
                      return (
                        <tr key={tx.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-3">
                            <Badge variant={isIncoming ? 'success' : 'default'}>
                              {isIncoming ? '↓ In' : '↑ Out'}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 font-mono font-medium">
                            {parseFloat(tx.amount).toFixed(2)} {tx.asset}
                          </td>
                          <td className="px-6 py-3">
                            <StellarAddressDisplay value={isIncoming ? tx.from : tx.to} />
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-neutral-500">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3">
                            <a
                              href={getStellarExplorerUrl(tx.hash, NETWORK)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-500 font-mono text-xs hover:underline"
                              aria-label={`View transaction ${tx.hash} on Stellar Explorer`}
                            >
                              {tx.hash.slice(0, 8)}…
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Balance Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Balance Trend</CardTitle>
              <span className="text-xs text-neutral-500">Last 30 days</span>
            </CardHeader>
            <BalanceTrendChart snapshots={snapshots ?? []} />
          </Card>

          {/* Alert Threshold Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Balance Alert Settings</CardTitle>
            </CardHeader>
            {alertSettings ? (
              <AlertThresholdSettings
                settings={alertSettings}
                onSave={(data) => saveAlertsMutation.mutate(data)}
                saving={saveAlertsMutation.isPending}
              />
            ) : (
              <p className="text-sm text-neutral-500">Loading alert settings…</p>
            )}
          </Card>
        </>
      )}

      {/* Confirm Payment Modal */}
      <ConfirmPaymentModal
        open={!!pendingPayment}
        data={pendingPayment}
        onConfirm={() => pendingPayment && sendMutation.mutate(pendingPayment)}
        onCancel={() => {
          setPendingPayment(null);
          setShowSendForm(true);
        }}
        loading={sendMutation.isPending}
      />
    </PageWrapper>
  );
}
