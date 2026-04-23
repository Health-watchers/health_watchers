'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalGet } from '@/lib/portalApi';

interface Appointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
}

interface Invoice {
  _id: string;
  amount: string;
  assetCode: string;
  status: string;
  createdAt: string;
}

export default function PortalDashboardPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalGet<Appointment[]>('/appointments'),
      portalGet<Invoice[]>('/invoices'),
    ])
      .then(([appts, invs]) => {
        setAppointments(appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').slice(0, 3));
        setInvoices(invs.filter((i) => i.status === 'pending').slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Welcome back</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Upcoming appointments */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-700">Upcoming Appointments</h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming appointments.</p>
          ) : (
            <ul className="space-y-2">
              {appointments.map((a) => (
                <li key={a._id} className="text-sm text-gray-700">
                  <span className="font-medium capitalize">{a.type}</span> —{' '}
                  {new Date(a.scheduledAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
          <Link href="/portal/appointments" className="mt-3 block text-xs text-blue-600 hover:underline">
            View all →
          </Link>
        </section>

        {/* Outstanding invoices */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-700">Outstanding Invoices</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-400">No outstanding invoices.</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((i) => (
                <li key={i._id} className="text-sm text-gray-700">
                  {i.amount} {i.assetCode}
                </li>
              ))}
            </ul>
          )}
          <Link href="/portal/payments" className="mt-3 block text-xs text-blue-600 hover:underline">
            View all →
          </Link>
        </section>
      </div>

      {/* Quick links */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/records" className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
            View My Records
          </Link>
          <Link href="/portal/consent" className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
            Manage Consent
          </Link>
        </div>
      </section>
    </div>
  );
}
