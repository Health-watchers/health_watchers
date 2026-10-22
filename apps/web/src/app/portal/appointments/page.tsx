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

interface WaitlistEntry {
  _id: string;
  status: 'waiting' | 'notified' | 'booked' | 'expired';
  position: number;
  priority: string;
  appointmentType: string;
  requestedDate: string;
  expiresAt?: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  completed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'no-show': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
};

const APPOINTMENT_TYPES = ['consultation', 'follow-up', 'procedure', 'emergency'] as const;

export default function PortalAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leavingWaitlist, setLeavingWaitlist] = useState(false);
  const [form, setForm] = useState({
    appointmentType: 'consultation' as (typeof APPOINTMENT_TYPES)[number],
    priority: 'routine' as 'routine' | 'urgent',
    requestedDate: '',
  });

  useEffect(() => {
    Promise.all([
      portalGet<Appointment[]>('/appointments').catch(() => []),
      portalGet<WaitlistEntry | null>('/waitlist/position').catch(() => null),
    ])
      .then(([appts, pos]) => {
        setAppointments(appts);
        setWaitlist(pos);
      })
      .finally(() => setLoading(false));
  }, []);

  const requestCancellation = async (id: string) => {
    if (!confirm('Request cancellation for this appointment?')) return;
    setCancelling(id);
    try {
      await portalFetch(`/appointments/${id}/cancel`, { method: 'POST' });
      setAppointments((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: 'cancelled' } : a))
      );
    } catch {
      alert('Could not cancel appointment. Please contact the clinic.');
    } finally {
      setCancelling(null);
    }
  };

  const joinWaitlist = async () => {
    if (!form.requestedDate) {
      alert('Please select a preferred date.');
      return;
    }
    setJoining(true);
    try {
      const res = await portalFetch('/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          appointmentType: form.appointmentType,
          priority: form.priority,
          requestedDate: new Date(form.requestedDate).toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to join waitlist');
      }
      const data = await res.json();
      setWaitlist(data.data);
      setShowWaitlistForm(false);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const leaveWaitlist = async () => {
    if (!waitlist || !confirm('Leave the waitlist?')) return;
    setLeavingWaitlist(true);
    try {
      await portalFetch(`/waitlist/${waitlist._id}`, { method: 'DELETE' });
      setWaitlist(null);
    } catch {
      alert('Could not leave waitlist.');
    } finally {
      setLeavingWaitlist(false);
    }
  };

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;

  const upcoming = appointments.filter((a) => ['scheduled', 'confirmed'].includes(a.status));
  const past = appointments.filter((a) => !['scheduled', 'confirmed'].includes(a.status));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Appointments</h1>

      {/* Waitlist status banner */}
      {waitlist && (
        <div
          className={`rounded-xl border p-4 ${
            waitlist.status === 'notified'
              ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
              : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">
                {waitlist.status === 'notified'
                  ? '🎉 A slot is available for you!'
                  : `You are #${waitlist.position} on the waitlist`}
              </p>
              <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                {waitlist.status === 'notified'
                  ? `Book before ${waitlist.expiresAt ? new Date(waitlist.expiresAt).toLocaleString() : 'your window expires'}`
                  : `Priority: ${waitlist.priority} · Type: ${waitlist.appointmentType}`}
              </p>
            </div>
            <button
              onClick={leaveWaitlist}
              disabled={leavingWaitlist}
              className="shrink-0 text-xs text-red-500 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              {leavingWaitlist ? 'Leaving…' : 'Leave waitlist'}
            </button>
          </div>
        </div>
      )}

      {/* Join waitlist CTA */}
      {!waitlist && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-800">
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            No slots available? Join the waitlist and we'll notify you when one opens.
          </p>
          <button
            onClick={() => setShowWaitlistForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Join Waitlist
          </button>
        </div>
      )}

      {/* Join waitlist form */}
      {showWaitlistForm && (
        <div className="space-y-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-800 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Join Waitlist</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              Appointment Type
              <select
                value={form.appointmentType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    appointmentType: e.target.value as (typeof APPOINTMENT_TYPES)[number],
                  }))
                }
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {APPOINTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              Priority
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as 'routine' | 'urgent' }))
                }
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
              Preferred Date
              <input
                type="date"
                value={form.requestedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setForm((f) => ({ ...f, requestedDate: e.target.value }))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowWaitlistForm(false)}
              className="text-sm text-gray-500 hover:underline dark:text-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={joinWaitlist}
              disabled={joining}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {joining ? 'Joining…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      <Section title="Upcoming">
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No upcoming appointments.</p>
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
          <p className="text-sm text-gray-400 dark:text-gray-500">No past appointments.</p>
        ) : (
          past.map((a) => <AppointmentRow key={a._id} appt={a} />)
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
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
    <div className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0 dark:border-gray-700">
      <div>
        <p className="text-sm font-medium capitalize text-gray-800 dark:text-gray-100">{appt.type}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(appt.scheduledAt).toLocaleString()}</p>
        {appt.chiefComplaint && <p className="text-xs text-gray-400 dark:text-gray-500">{appt.chiefComplaint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          {appt.status}
        </span>
        {onCancel && appt.status !== 'cancelled' && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="text-xs text-red-500 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}
