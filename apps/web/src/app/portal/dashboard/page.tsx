'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalGet } from '@/lib/portalApi';

interface Appointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
  isTelemedicine?: boolean;
  telemedicine?: boolean;
  videoRoomId?: string;
}

interface Survey {
  _id: string;
  title: string;
  status?: string;
  completedAt?: string | null;
  dueAt?: string;
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
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalGet<Appointment[]>('/appointments'),
      portalGet<Invoice[]>('/invoices'),
      portalGet<Survey[]>('/surveys').catch(() => [] as Survey[]),
    ])
      .then(([appts, invs, svys]) => {
        setAppointments(
          appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').slice(0, 3)
        );
        setInvoices(invs.filter((i) => i.status === 'pending').slice(0, 3));
        setSurveys(
          (svys || []).filter((s) => !s.completedAt && s.status !== 'completed').slice(0, 5)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isTelemedicine = (a: Appointment) => Boolean(a.isTelemedicine ?? a.telemedicine);

  const joinableVisit = appointments.find((a) => {
    if (!isTelemedicine(a)) return false;
    const start = new Date(a.scheduledAt).getTime();
    if (Number.isNaN(start)) return false;
    const diff = start - Date.now();
    return diff <= 60 * 60 * 1000 && diff >= -60 * 60 * 1000;
  });

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Welcome back</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Upcoming appointments */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">
            Upcoming Appointments
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No upcoming appointments.</p>
          ) : (
            <ul className="space-y-2">
              {appointments.map((a) => (
                <li key={a._id} className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium capitalize">{a.type}</span> —{' '}
                  {new Date(a.scheduledAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/portal/appointments"
            className="mt-3 block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View all →
          </Link>
        </section>

        {/* Outstanding invoices */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">
            Outstanding Invoices
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No outstanding invoices.</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((i) => (
                <li key={i._id} className="text-sm text-gray-700 dark:text-gray-300">
                  {i.amount} {i.assetCode}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/portal/payments"
            className="mt-3 block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View all →
          </Link>
        </section>

        {/* Pending surveys */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">Pending Surveys</h2>
          {surveys.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No pending surveys.</p>
          ) : (
            <ul className="space-y-2">
              {surveys.map((s) => (
                <li key={s._id} className="text-sm text-gray-700 dark:text-gray-300">
                  <Link
                    href={`/portal/surveys/${s._id}`}
                    className="hover:underline dark:hover:text-gray-100"
                  >
                    {s.title}
                  </Link>
                  {s.dueAt && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      Due {new Date(s.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/portal/surveys"
            className="mt-3 block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View all →
          </Link>
        </section>
      </div>

      {/* Quick links */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/portal/records"
            className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            View My Records
          </Link>
          <Link
            href="/portal/consent"
            className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            Manage Consent
          </Link>
          <Link
            href="/portal/records?export=1"
            className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            Download My Data
          </Link>
          <Link
            href="/portal/surveys"
            className="rounded-md bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            Complete Surveys
          </Link>
          {joinableVisit && (
            <Link
              href={`/portal/appointments/${joinableVisit._id}/waiting-room`}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Join Video Visit
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
