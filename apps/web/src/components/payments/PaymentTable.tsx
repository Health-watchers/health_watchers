"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { StellarAddressDisplay } from "@/components/ui/StellarAddressDisplay";
import { ConfirmPaymentModal } from "@/components/payments/ConfirmPaymentModal";

export interface Payment {
  id: string;
  patientId: string;
  amount: string;
  asset?: string;
  status: "pending" | "completed" | "failed" | string;
  txHash?: string;
  createdAt?: string;
}

type StatusFilter = "all" | "pending" | "completed" | "failed";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

function statusBadgeVariant(status: string) {
  if (status === "completed") return "success";
  if (status === "pending") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

interface Props {
  payments: Payment[];
  network?: string;
  /** Called when user confirms a payment; should throw on failure */
  onConfirm: (paymentId: string, txHash: string) => Promise<void>;
}

export function PaymentTable({
  payments,
  network = "testnet",
  onConfirm,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const filtered = payments.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (dateFrom && p.createdAt && p.createdAt < dateFrom) return false;
    if (dateTo && p.createdAt && p.createdAt > dateTo + "T23:59:59")
      return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          <label
            htmlFor="date-from"
            className="text-xs text-neutral-500 whitespace-nowrap"
          >
            From
          </label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <label htmlFor="date-to" className="text-xs text-neutral-500">
            To
          </label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                ID
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Patient
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Amount
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Transaction
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  No payments match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-neutral-50 transition-colors"
                >
                  <td
                    className="px-4 py-3 font-mono text-xs text-neutral-600 max-w-[120px] truncate"
                    title={p.id}
                  >
                    {p.id.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{p.patientId}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {p.amount}{" "}
                    <span className="text-neutral-400 font-normal">
                      {p.asset ?? "XLM"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(p.status)}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {p.txHash ? (
                      <StellarAddressDisplay
                        value={p.txHash}
                        type="tx"
                        network={network}
                      />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                    {p.createdAt
                      ? new Date(p.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Confirm only visible on pending rows */}
                      {p.status === "pending" && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setConfirmTarget(p.id)}
                        >
                          Confirm
                        </Button>
                      )}
                      {p.txHash && (
                        <a
                          href={`https://stellar.expert/explorer/${network}/tx/${p.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-primary-500 hover:bg-primary-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          View on Explorer
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      {confirmTarget && (
        <ConfirmPaymentModal
          open={Boolean(confirmTarget)}
          onClose={() => setConfirmTarget(null)}
          paymentId={confirmTarget}
          onConfirm={async (id, txHash) => {
            await onConfirm(id, txHash);
            setConfirmTarget(null);
          }}
        />
      )}
    </div>
  );
}
