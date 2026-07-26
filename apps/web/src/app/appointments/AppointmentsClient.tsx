'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

interface Appointment {
  _id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no-show' | 'patient_arrived';
  chiefComplaint?: string;
  isTelemedicine?: boolean;
  videoRoomUrl?: string;
}

interface AppointmentDraft {
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  isTelemedicine: boolean;
  chiefComplaint: string;
}

interface Labels {
  title: string;
  loading: string;
  empty: string;
  scheduled: string;
  confirmed: string;
  cancelled: string;
  completed: string;
  noShow: string;
  allDoctors: string;
  prevWeek: string;
  nextWeek: string;
  today: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  confirmed: '#22c55e',
  cancelled: '#ef4444',
  completed: '#8b5cf6',
  'no-show': '#f97316',
  patient_arrived: '#a855f7',
};

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(datetime: string, hour12 = true) {
  return new Date(datetime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  });
}

export default function AppointmentsClient({ labels }: { labels: Labels }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(new Date());
  const [doctorFilter, setDoctorFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AppointmentDraft>({
    patientId: '',
    doctorId: '',
    scheduledAt: new Date().toISOString().slice(0, 16),
    duration: 30,
    type: 'Office visit',
    isTelemedicine: false,
    chiefComplaint: '',
  });
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const weekDays = getWeekDays(anchor);
  const dateFrom = weekDays[0].toISOString();
  const dateTo = weekDays[6].toISOString();

  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo, limit: '200' });
        if (doctorFilter) params.set('doctorId', doctorFilter);
        const res = await fetchWithAuth(`${API_V1}/appointments?${params}`);
        if (!res.ok) throw new Error(`Failed to load appointments (${res.status})`);
        const data = await res.json();
        setAppointments(data.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load appointments');
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, [dateFrom, dateTo, doctorFilter]);

  const doctors = Array.from(new Set(appointments.map((a) => a.doctorId))).sort();

  const shiftWeek = (n: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + n * 7);
    setAnchor(d);
  };

  const createAppointment = async () => {
    setStatusMessage(null);
    setErrorMessage(null);

    if (!draft.patientId.trim() || !draft.doctorId.trim() || !draft.scheduledAt) {
      setErrorMessage('Patient, clinician, and date/time are required.');
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_V1}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to create appointment (${res.status})`);
      }

      const data = await res.json();
      const appointment: Appointment = data.data ?? data;
      setAppointments((prev) => [appointment, ...prev]);
      setConfirmation(appointment);
      setStatusMessage('Appointment created successfully.');
      setShowForm(false);
      setDraft({
        patientId: '',
        doctorId: '',
        scheduledAt: new Date().toISOString().slice(0, 16),
        duration: 30,
        type: 'Office visit',
        isTelemedicine: false,
        chiefComplaint: '',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create appointment');
    }
  };

  const cancelAppointment = async (id: string) => {
    setCancelingId(id);
    try {
      const res = await fetchWithAuth(`${API_V1}/appointments/${encodeURIComponent(id)}/cancel`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(`Failed to cancel (${res.status})`);
      setAppointments((prev) => prev.map((appt) => (appt._id === id ? { ...appt, status: 'cancelled' } : appt)));
      setStatusMessage('Appointment cancelled.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel appointment');
    } finally {
      setCancelingId(null);
    }
  };

  const rescheduleAppointment = async (appointment: Appointment, newDate: string) => {
    setErrorMessage(null);
    try {
      const res = await fetchWithAuth(`${API_V1}/appointments/${encodeURIComponent(appointment._id)}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newDate }),
      });
      if (!res.ok) throw new Error(`Failed to reschedule (${res.status})`);
      setAppointments((prev) =>
        prev.map((appt) =>
          appt._id === appointment._id ? { ...appt, scheduledAt: newDate, status: 'scheduled' } : appt,
        ),
      );
      setRescheduleTarget(null);
      setStatusMessage('Appointment rescheduled.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reschedule appointment');
    }
  };

  const getAvailableTimes = (day: Date) => {
    const slots = ['09:00', '11:00', '13:30', '15:00'];
    const booked = appointments
      .filter((appt) => isSameDay(new Date(appt.scheduledAt), day))
      .map((appt) => formatTime(appt.scheduledAt, false));

    return slots.filter((slot) => !booked.includes(slot));
  };

  return (
    <main id="main-content" style={{ padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{labels.title}</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', borderRadius: 6, border: 'none', cursor: 'pointer' }}
        >
          + Book appointment
        </button>
      </div>

      {statusMessage && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: '#ecfdf5', color: '#065f46' }}>
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>
          {errorMessage}
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #d1d5db', borderRadius: 12, background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>New appointment</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#6b7280' }}>Choose a patient, clinician, and time slot.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ background: 'transparent', border: '1px solid #d1d5db', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '1rem' }}>
            <label style={{ display: 'block' }}>
              Patient ID
              <input
                type="text"
                value={draft.patientId}
                onChange={(e) => setDraft((prev) => ({ ...prev, patientId: e.target.value }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              Clinician ID
              <input
                type="text"
                value={draft.doctorId}
                onChange={(e) => setDraft((prev) => ({ ...prev, doctorId: e.target.value }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              Date & time
              <input
                type="datetime-local"
                value={draft.scheduledAt}
                onChange={(e) => setDraft((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              Visit type
              <select
                value={draft.type}
                onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              >
                <option>Office visit</option>
                <option>Telemedicine</option>
                <option>Follow-up</option>
              </select>
            </label>
            <label style={{ display: 'block' }}>
              Duration (minutes)
              <input
                type="number"
                value={draft.duration}
                min={10}
                onChange={(e) => setDraft((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <input
                id="telemedicine"
                type="checkbox"
                checked={draft.isTelemedicine}
                onChange={(e) => setDraft((prev) => ({ ...prev, isTelemedicine: e.target.checked }))}
              />
              <label htmlFor="telemedicine" style={{ margin: 0, fontSize: '0.95rem', color: '#334155' }}>
                Telemedicine visit
              </label>
            </div>
            <label style={{ display: 'block' }}>
              Chief complaint
              <input
                type="text"
                value={draft.chiefComplaint}
                onChange={(e) => setDraft((prev) => ({ ...prev, chiefComplaint: e.target.value }))}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ padding: '0.7rem 1.2rem', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createAppointment}
              style={{ padding: '0.7rem 1.2rem', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
            >
              Confirm booking
            </button>
          </div>
        </div>
      )}

      {confirmation && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #d1fae5', borderRadius: 12, background: '#ecfdf5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', color: '#065f46' }}>Confirmed appointment</p>
              <strong style={{ display: 'block', fontSize: '1rem', color: '#064e3b' }}>{confirmation.type}</strong>
              <p style={{ margin: '0.25rem 0 0', color: '#065f46' }}>
                {confirmation.patientId} with {confirmation.doctorId} at {formatTime(confirmation.scheduledAt)} on {new Date(confirmation.scheduledAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', padding: '1rem', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Total appointments</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{appointments.length}</p>
        </div>
        <div style={{ flex: '1 1 220px', padding: '1rem', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Confirmed</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{appointments.filter((a) => a.status === 'confirmed').length}</p>
        </div>
      </div>

      {loading ? (
        <p role="status" aria-live="polite">{labels.loading}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            role="grid"
            aria-label={labels.title}
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}
          >
            <thead>
              <tr>
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <th
                      key={day.toISOString()}
                      scope="col"
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #e5e7eb',
                        background: isToday ? '#eff6ff' : '#f9fafb',
                        fontWeight: isToday ? 700 : 600,
                        fontSize: '0.85rem',
                        textAlign: 'center',
                      }}
                    >
                      {day.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDays.map((day) => {
                  const dayAppts = appointments.filter((a) => isSameDay(new Date(a.scheduledAt), day));
                  return (
                    <td
                      key={day.toISOString()}
                      valign="top"
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #e5e7eb',
                        verticalAlign: 'top',
                        minHeight: 120,
                      }}
                    >
                      {dayAppts.length === 0 ? (
                        <div style={{ color: '#475569', fontSize: '0.82rem', lineHeight: 1.6 }}>
                          <strong>Available slots:</strong>
                          {getAvailableTimes(day).length > 0 ? (
                            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem' }}>
                              {getAvailableTimes(day).map((slot) => (
                                <li key={slot}>{slot}</li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ margin: '0.5rem 0 0', color: '#94a3b8' }}>All slots booked</p>
                          )}
                        </div>
                      ) : (
                        dayAppts.map((appt) => (
                          <div
                            key={appt._id}
                            role="article"
                            aria-label={`${appt.type} at ${formatTime(appt.scheduledAt)}${appt.isTelemedicine ? ' (telemedicine)' : ''}`}
                            style={{
                              background: STATUS_COLORS[appt.status] ?? '#6b7280',
                              color: '#fff',
                              borderRadius: 10,
                              padding: '0.75rem',
                              marginBottom: '0.75rem',
                              fontSize: '0.85rem',
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{formatTime(appt.scheduledAt)} · {appt.duration}m</div>
                            <div style={{ opacity: 0.9, margin: '0.25rem 0' }}>{appt.type}</div>
                            {appt.isTelemedicine && <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Video visit</div>}
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => cancelAppointment(appt._id)}
                                disabled={cancelingId === appt._id}
                                style={{
                                  borderRadius: 8,
                                  border: '1px solid rgba(255,255,255,0.7)',
                                  background: 'rgba(255,255,255,0.14)',
                                  color: '#fff',
                                  padding: '0.35rem 0.6rem',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                }}
                              >
                                {cancelingId === appt._id ? 'Cancelling...' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTarget(appt);
                                  setRescheduleDate(appt.scheduledAt.slice(0, 16));
                                }}
                                style={{
                                  borderRadius: 8,
                                  border: '1px solid rgba(255,255,255,0.7)',
                                  background: 'rgba(255,255,255,0.14)',
                                  color: '#fff',
                                  padding: '0.35rem 0.6rem',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Reschedule
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {rescheduleTarget && (
        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Reschedule appointment</p>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem', gridTemplateColumns: '1fr auto' }}>
            <input
              type="datetime-local"
              value={rescheduleDate}
              onChange={(event) => setRescheduleDate(event.target.value)}
              style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            />
            <button
              type="button"
              onClick={() => rescheduleTarget && rescheduleAppointment(rescheduleTarget, rescheduleDate)}
              style={{ borderRadius: 8, padding: '0.75rem 1rem', border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
            >
              Update
            </button>
          </div>
        </div>
      )}

      {!loading && appointments.length === 0 && (
        <p role="status" style={{ marginTop: '1rem', color: '#6b7280' }}>
          {labels.empty}
        </p>
      )}
    </main>
  );
}
