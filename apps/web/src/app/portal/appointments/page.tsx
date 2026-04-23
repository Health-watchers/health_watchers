'use client';

import { useEffect, useState } from 'react';
import { portalGet, portalFetch } from '@/lib/portalApi';

interface Appointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
  chiefComplaint?: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-600',
  'no-show': 'bg-yellow-100 text-yellow-700',
};

export default function PortalAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    portalGet<Appointment[]>('/appointments')
      .then(setAppointments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestCancellation = async (id: string) => {
    if (!confirm('Request cancellation for this appointment?')) return;
    setCancelling(id);
    try {
      await portalFetch(`/appointments/${id}/cancel`, { method: 'POST' });
      setAppointments((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: 'cancelled' } : a)),
      );
    } catch {
      alert('Could not cancel appointment. Please contact the clinic.');
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  const upcoming = appointments.filter((a) => ['scheduled', 'confirmed'].includes(a.status));
  const past = appointments.filter((a) => !['scheduled', 'confirmed'].includes(a.status));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">My Appointments</h1>

      <Section title="Upcoming">
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400">No upcoming appointments.</p>
        ) : (
          upcoming.map((a) => (
            <AppointmentRow
              key={a._id}
              appt={a}
              onCancel={() => requestCancellation(a._id)}
              cancelling={cancelling === a._id}
            />
          ))
        )}
      </Section>

      <Section title="History">
        {past.length === 0 ? (
          <p className="text-sm text-gray-400">No past appointments.</p>
        ) : (
          past.map((a) => <AppointmentRow key={a._id} appt={a} />)
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

function AppointmentRow({
  appt,
  onCancel,
  cancelling,
}: {
  appt: Appointment;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium capitalize text-gray-800">{appt.type}</p>
        <p className="text-xs text-gray-500">{new Date(appt.scheduledAt).toLocaleString()}</p>
        {appt.chiefComplaint && (
          <p className="text-xs text-gray-400">{appt.chiefComplaint}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {appt.status}
        </span>
        {onCancel && appt.status !== 'cancelled' && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}
