'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper, PageHeader } from '@/components/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

const API = `${API_URL}/api/v1/reports`;

type Period = 'this_month' | 'last_month' | 'last_3_months';

function getPeriodDates(period: Period): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'this_month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  }
  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(start), to: fmt(end) };
  }
  // last_3_months
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  return { from: fmt(start), to: fmt(now) };
}

async function fetchOverview(from: string, to: string) {
  const res = await fetchWithAuth(`${API}/overview?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Failed to load overview');
  return (await res.json()).data;
}

async function fetchPatientReport(from: string, to: string) {
  const res = await fetchWithAuth(`${API}/patients?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Failed to load patient report');
  return (await res.json()).data;
}

async function fetchEncounterReport(from: string, to: string) {
  const res = await fetchWithAuth(`${API}/encounters?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Failed to load encounter report');
  return (await res.json()).data;
}

async function fetchPaymentReport(from: string, to: string) {
  const res = await fetchWithAuth(`${API}/payments?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Failed to load payment report');
  return (await res.json()).data;
}

function SimpleBarChart({ data, labelKey, valueKey, title }: {
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
  title: string;
}) {
  if (!data?.length) return <p className="text-sm text-neutral-500">No data available</p>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div role="img" aria-label={title}>
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 truncate text-neutral-600">{item[labelKey]}</span>
            <div className="flex-1 rounded bg-neutral-100" aria-hidden="true">
              <div
                className="bg-primary-500 h-5 rounded transition-all"
                style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right font-medium">{item[valueKey]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const { from, to } = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getPeriodDates(period);

  const overviewQ = useQuery({ queryKey: ['reports-overview', from, to], queryFn: () => fetchOverview(from, to) });
  const patientQ = useQuery({ queryKey: ['reports-patients', from, to], queryFn: () => fetchPatientReport(from, to) });
  const encounterQ = useQuery({ queryKey: ['reports-encounters', from, to], queryFn: () => fetchEncounterReport(from, to) });
  const paymentQ = useQuery({ queryKey: ['reports-payments', from, to], queryFn: () => fetchPaymentReport(from, to) });

  const overview = overviewQ.data;

  function handleExport(type: 'patients' | 'encounters' | 'payments') {
    window.open(`${API}/export?type=${type}&from=${from}&to=${to}`, '_blank');
  }

  return (
    <PageWrapper className="space-y-8 py-8">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Clinic performance overview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(['this_month', 'last_month', 'last_3_months'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setUseCustom(false); }}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  !useCustom && period === p
                    ? 'bg-primary-500 text-white'
                    : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
                ].join(' ')}
                aria-pressed={!useCustom && period === p}
              >
                {p === 'this_month' ? 'This Month' : p === 'last_month' ? 'Last Month' : 'Last 3 Months'}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => { setCustomFrom(e.target.value); setUseCustom(true); }}
                className="rounded border border-neutral-300 px-2 py-1 text-xs"
                aria-label="Custom start date"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => { setCustomTo(e.target.value); setUseCustom(true); }}
                className="rounded border border-neutral-300 px-2 py-1 text-xs"
                aria-label="Custom end date"
              />
            </div>
          </div>
        }
      />

      {/* KPI Overview */}
      {overviewQ.isError ? (
        <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Could not load report data. You may not have permission to view reports.
        </div>
      ) : (
        <section aria-label="Key performance indicators">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard title="New Patients" value={overview?.patients?.new ?? '—'} icon="🧑‍⚕️" color="blue" label="New patients in period" />
            <StatCard title="Total Encounters" value={overview?.encounters?.total ?? '—'} icon="📋" color="green" label="Total encounters in period" />
            <StatCard title="Confirmed Payments" value={overview?.payments?.confirmed ?? '—'} icon="💳" color="indigo" label="Confirmed payments in period" />
            <StatCard title="AI Summaries" value={overview?.aiSummaries?.generated ?? '—'} icon="🤖" color="yellow" label="AI summaries generated" />
          </div>
          {overview && (
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4 text-sm text-neutral-600">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="font-medium">Active Patients</p>
                <p className="text-2xl font-bold text-neutral-900">{overview.patients.active}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="font-medium">Completion Rate</p>
                <p className="text-2xl font-bold text-neutral-900">
                  {overview.encounters.total > 0
                    ? `${((overview.encounters.completed / overview.encounters.total) * 100).toFixed(0)}%`
                    : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="font-medium">Pending Payments</p>
                <p className="text-2xl font-bold text-neutral-900">{overview.payments.pending}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="font-medium">Revenue (XLM)</p>
                <p className="text-2xl font-bold text-neutral-900">{overview.payments.totalXLM}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Patient Growth */}
        <section aria-label="Patient growth chart" className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Patient Registrations by Month</h2>
            <button
              onClick={() => handleExport('patients')}
              className="text-xs text-primary-600 hover:underline focus:outline-none focus:underline"
              aria-label="Export patients CSV"
            >
              Export CSV
            </button>
          </div>
          {patientQ.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />
          ) : (
            <SimpleBarChart
              data={patientQ.data?.newByMonth ?? []}
              labelKey="month"
              valueKey="count"
              title="Patient registrations by month"
            />
          )}
        </section>

        {/* Encounter Volume */}
        <section aria-label="Encounter volume chart" className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Top Chief Complaints</h2>
            <button
              onClick={() => handleExport('encounters')}
              className="text-xs text-primary-600 hover:underline focus:outline-none focus:underline"
              aria-label="Export encounters CSV"
            >
              Export CSV
            </button>
          </div>
          {encounterQ.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />
          ) : (
            <SimpleBarChart
              data={encounterQ.data?.topComplaints ?? []}
              labelKey="complaint"
              valueKey="count"
              title="Top chief complaints"
            />
          )}
        </section>

        {/* Payment Trends */}
        <section aria-label="Payment trends chart" className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Payment Volume by Month</h2>
            <button
              onClick={() => handleExport('payments')}
              className="text-xs text-primary-600 hover:underline focus:outline-none focus:underline"
              aria-label="Export payments CSV"
            >
              Export CSV
            </button>
          </div>
          {paymentQ.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />
          ) : (
            <SimpleBarChart
              data={paymentQ.data?.byMonth ?? []}
              labelKey="month"
              valueKey="count"
              title="Payment volume by month"
            />
          )}
        </section>

        {/* Revenue by Asset */}
        <section aria-label="Revenue by asset" className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Revenue by Currency</h2>
          {paymentQ.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-neutral-100" aria-busy="true" />
          ) : (
            <div className="space-y-3">
              {(paymentQ.data?.byAsset ?? []).map((a: any) => (
                <div key={a.asset} className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
                  <span className="font-medium">{a.asset}</span>
                  <div className="text-right">
                    <p className="font-bold">{a.total}</p>
                    <p className="text-xs text-neutral-500">{a.count} transactions</p>
                  </div>
                </div>
              ))}
              {!paymentQ.data?.byAsset?.length && (
                <p className="text-sm text-neutral-500">No payment data available</p>
              )}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}
