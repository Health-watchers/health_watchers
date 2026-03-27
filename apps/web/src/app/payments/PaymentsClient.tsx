"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ErrorMessage,
  Toast,
  TableSkeleton,
  ModuleEmptyState,
  Button,
} from "@/components/ui";
import {
  CreatePaymentIntentForm,
  type CreatePaymentData,
} from "@/components/forms/CreatePaymentIntentForm";
import { getStellarExplorerUrl } from "@/lib/stellar";
import { queryKeys } from "@/lib/queryKeys";

const API = "http://localhost:3001/api/v1";

interface Payment {
  id: string;
  patientId: string;
  amount: string;
  status: string;
  txHash?: string;
}

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  patient: string;
  amount: string;
  status: string;
  view: string;
}

export default function PaymentsClient({ labels }: { labels: Labels }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const {
    data: payments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const res = await fetch(`${API}/payments`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data || data || [];
    },
  });

  const handleCreate = async (data: CreatePaymentData) => {
    const res = await fetch(`${API}/payments/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Error ${res.status}`);
    }
    setShowForm(false);
    setToast({ message: "Payment intent created.", type: "success" });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() });
  };

  if (isLoading) return <TableSkeleton columns={4} rows={5} />;
  if (error)
    return (
      <ErrorMessage
        message={
          error instanceof Error ? error.message : "Failed to load payments."
        }
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() })
        }
      />
    );

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {labels.title}
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Payment
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            New Payment Intent
          </h2>
          <CreatePaymentIntentForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {payments.length === 0 ? (
        <ModuleEmptyState
          module="payments"
          action={
            <Button variant="primary" size="md" className="mt-2">
              Create Payment
            </Button>
          }
        />
      ) : (
        <ul
          aria-label={labels.title}
          className="flex flex-col gap-4 list-none p-0 m-0"
        >
          {payments.map((p: Payment) => (
            <li
              key={p.id}
              className="rounded border border-gray-200 p-4 shadow-sm"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {labels.id}
                  </p>
                  <p className="font-medium text-gray-900 break-all">{p.id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {labels.patient}
                  </p>
                  <p className="font-medium text-gray-900 break-all">
                    {p.patientId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {labels.amount}
                  </p>
                  <p className="text-gray-700">{p.amount} XLM</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {labels.status}
                  </p>
                  <p className="text-gray-700">{p.status}</p>
                </div>
              </div>
              {p.txHash && (
                <div className="mt-3 text-sm">
                  <a
                    href={getStellarExplorerUrl(
                      p.txHash,
                      process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
                    )}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${labels.view} transaction on Stellar Explorer (opens in new tab)`}
                    className="text-blue-600 hover:underline"
                  >
                    {labels.view} →
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
