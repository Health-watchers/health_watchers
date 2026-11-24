'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { WaitlistPanel } from '@/components/appointments/WaitlistPanel';
import {
  useAppointments,
  useCreateAppointment,
  useRescheduleAppointment,
  useCancelAppointment,
} from '@/hooks/useAppointments';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [view, setView] = useState<'calendar' | 'waitlist'>('calendar');

  const weekDays = getWeekDays(anchor);
  const dateFrom = weekDays[0].toISOString();
  const dateTo = weekDays[6].toISOString();

  // ── React Query hooks ─────────────────────────────────────────────────────
  const { data: appointments = [], isLoading } = useAppointments(
    dateFrom,
    dateTo,
    doctorFilter || undefined,
  );
  const createMutation = useCreateAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const cancelMutation = useCancelAppointment();

  // Deep link: /appointments?tab=waitlist
  useMemo(() => {
    if (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('tab') === 'waitlist'
    )
      setView('waitlist');
  }, []);

  const changeView = (next: string) => {
    const tab = next === 'waitlist' ? 'waitlist' : 'calendar';
    setView(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'waitlist') url.searchParams.set('tab', 'waitlist');
      else url.searchParams.delete('tab');
      window.history.replaceState(null, '', url);
    }
  };

  const doctors = Array.from(new Set(appointments.map((a) => a.doctorId))).sort();

  const shiftWeek = (n: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + n * 7);
    setAnchor(d);
  };

  const createAppointment = async () => {
    setErrorMessage(null);

    if (!draft.patientId.trim() || !draft.doctorId.trim() || !draft.scheduledAt) {
      setErrorMessage('Patient, clinician, and date/time are required.');
      return;
    }

    try {
      const appointment = await createMutation.mutateAsync(draft);
      setConfirmation(appointment);
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
    try {
      await cancelMutation.mutateAsync(id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel appointment');
    }
  };

  const rescheduleAppointment = async (appointment: Appointment, newDate: string) => {
    setErrorMessage(null);
    try {
      await rescheduleMutation.mutateAsync({
        appointmentId: appointment._id,
        scheduledAt: newDate,
      });
      setRescheduleTarget(null);
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
    <main
      id="main-content"
      className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ padding: '1.5rem', fontFamily: 'sans-serif' }}
    >
      <div
        style={{
          marginBottom: '1rem',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0 }}>{labels.title}</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          + Book appointment
        </button>
      </div>

      <Tabs value={view} onValueChange={changeView}>
        <TabsList className="mb-4">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>

        <TabsContent value="waitlist">
          <WaitlistPanel />
        </TabsContent>

        <TabsContent value="calendar">
          {createMutation.isSuccess && confirmation && (
            <div
              className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 8,
              }}
            >
              {createMutation.isSuccess ? 'Appointment created successfully.' : ''}
            </div>
          )}
          {errorMessage && (
            <div
              className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 8,
              }}
            >
              {errorMessage}
            </div>
          )}

          {showForm && (
            <div
              className="border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                border: '1px solid',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>New appointment</h2>
                  <p className="text-slate-500 dark:text-slate-400" style={{ margin: '0.25rem 0 0' }}>
                    Choose a patient, clinician, and time slot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  style={{
                    background: 'transparent',
                    border: '1px solid',
                    borderRadius: 8,
                    padding: '0.4rem 0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '1rem',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  marginTop: '1rem',
                }}
              >
                <label style={{ display: 'block' }}>
                  Patient ID
                  <input
                    type="text"
                    value={draft.patientId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, patientId: e.target.value }))}
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </label>
                <label style={{ display: 'block' }}>
                  Clinician ID
                  <input
                    type="text"
                    value={draft.doctorId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, doctorId: e.target.value }))}
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </label>
                <label style={{ display: 'block' }}>
                  Date & time
                  <input
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={(e) => setDraft((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </label>
                <label style={{ display: 'block' }}>
                  Visit type
                  <select
                    value={draft.type}
                    onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
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
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, duration: Number(e.target.value) }))
                    }
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </label>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}
                >
                  <input
                    id="telemedicine"
                    type="checkbox"
                    checked={draft.isTelemedicine}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, isTelemedicine: e.target.checked }))
                    }
                  />
                  <label
                    htmlFor="telemedicine"
                    className="text-slate-700 dark:text-slate-300"
                    style={{ margin: 0, fontSize: '0.95rem' }}
                  >
                    Telemedicine visit
                  </label>
                </div>
                <label style={{ display: 'block' }}>
                  Chief complaint
                  <input
                    type="text"
                    value={draft.chiefComplaint}
                    onChange={(e) => setDraft((prev) => ({ ...prev, chiefComplaint: e.target.value }))}
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '1rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  style={{
                    padding: '0.7rem 1.2rem',
                    borderRadius: 8,
                    border: '1px solid',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createAppointment}
                  className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                  style={{
                    padding: '0.7rem 1.2rem',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Confirm booking
                </button>
              </div>
            </div>
          )}

          {confirmation && (
            <div
              className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                border: '1px solid',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <p
                    className="text-emerald-800 dark:text-emerald-200"
                    style={{ margin: '0 0 0.25rem', fontSize: '0.95rem' }}
                  >
                    Confirmed appointment
                  </p>
                  <strong
                    className="text-emerald-900 dark:text-emerald-100"
                    style={{ display: 'block', fontSize: '1rem' }}
                  >
                    {confirmation.type}
                  </strong>
                  <p className="text-emerald-800 dark:text-emerald-200" style={{ margin: '0.25rem 0 0' }}>
                    {confirmation.patientId} with {confirmation.doctorId} at{' '}
                    {formatTime(confirmation.scheduledAt)} on{' '}
                    {new Date(confirmation.scheduledAt).toLocaleDateString()}.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div
              className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
              style={{
                flex: '1 1 220px',
                padding: '1rem',
                borderRadius: 12,
                border: '1px solid',
              }}
            >
              <p
                className="text-slate-500 dark:text-slate-400"
                style={{ margin: 0, fontSize: '0.85rem' }}
              >
                Total appointments
              </p>
              <p
                className="text-slate-900 dark:text-slate-100"
                style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', fontWeight: 700 }}
              >
                {appointments.length}
              </p>
            </div>
            <div
              className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
              style={{
                flex: '1 1 220px',
                padding: '1rem',
                borderRadius: 12,
                border: '1px solid',
              }}
            >
              <p
                className="text-slate-500 dark:text-slate-400"
                style={{ margin: 0, fontSize: '0.85rem' }}
              >
                Confirmed
              </p>
              <p
                className="text-slate-900 dark:text-slate-100"
                style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', fontWeight: 700 }}
              >
                {appointments.filter((a) => a.status === 'confirmed').length}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div role="status" aria-live="polite" aria-label={labels.loading}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 720 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {weekDays.map((day) => (
                      <Skeleton key={day.toISOString()} variant="text" height={20} />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: '0.5rem',
                    }}
                  >
                    {weekDays.map((day) => (
                      <div
                        key={day.toISOString()}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                      >
                        <Skeleton variant="rect" height={72} />
                        <Skeleton variant="rect" height={72} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
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
                          className={
                            isToday
                              ? 'border border-slate-200 bg-blue-50 font-bold text-slate-900 dark:border-slate-700 dark:bg-blue-950 dark:text-slate-100'
                              : 'border border-slate-200 bg-slate-50 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                          }
                          style={{
                            padding: '0.75rem',
                            border: '1px solid',
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
                      const dayAppts = appointments.filter((a) =>
                        isSameDay(new Date(a.scheduledAt), day)
                      );
                      return (
                        <td
                          key={day.toISOString()}
                          valign="top"
                          className="border border-slate-200 dark:border-slate-700"
                          style={{
                            padding: '0.75rem',
                            border: '1px solid',
                            verticalAlign: 'top',
                            minHeight: 120,
                          }}
                        >
                          {dayAppts.length === 0 ? (
                            <div
                              className="text-slate-600 dark:text-slate-400"
                              style={{ fontSize: '0.82rem', lineHeight: 1.6 }}
                            >
                              <strong>Available slots:</strong>
                              {getAvailableTimes(day).length > 0 ? (
                                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem' }}>
                                  {getAvailableTimes(day).map((slot) => (
                                    <li key={slot}>{slot}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p
                                  className="text-slate-400 dark:text-slate-500"
                                  style={{ margin: '0.5rem 0 0' }}
                                >
                                  All slots booked
                                </p>
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
                                <div style={{ fontWeight: 700 }}>
                                  {formatTime(appt.scheduledAt)} · {appt.duration}m
                                </div>
                                <div style={{ opacity: 0.9, margin: '0.25rem 0' }}>{appt.type}</div>
                                {appt.isTelemedicine && (
                                  <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Video visit</div>
                                )}
                                <div
                                  style={{
                                    marginTop: '0.5rem',
                                    display: 'flex',
                                    gap: '0.4rem',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setCancelTarget(appt)}
                                    disabled={cancelMutation.isPending}
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
                                    {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
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
            <div
              className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
              style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: 12,
                border: '1px solid',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700 }}>Reschedule appointment</p>
              <div
                style={{
                  display: 'grid',
                  gap: '0.75rem',
                  marginTop: '0.75rem',
                  gridTemplateColumns: '1fr auto',
                }}
              >
                <input
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                  style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                />
                <button
                  type="button"
                  onClick={() =>
                    rescheduleTarget && rescheduleAppointment(rescheduleTarget, rescheduleDate)
                  }
                  className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                  style={{
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Update
                </button>
              </div>
            </div>
          )}

          {!isLoading && appointments.length === 0 && (
            <p
              role="status"
              className="text-slate-500 dark:text-slate-400"
              style={{ marginTop: '1rem' }}
            >
              {labels.empty}
            </p>
          )}
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => {
          if (!cancelMutation.isPending) setCancelTarget(null);
        }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await cancelAppointment(cancelTarget._id);
          setCancelTarget(null);
        }}
        title="Cancel appointment"
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        loading={cancelMutation.isPending}
        message={
          cancelTarget ? (
            <>
              Are you sure you want to cancel this <strong>{cancelTarget.type}</strong> appointment
              scheduled for <strong>{new Date(cancelTarget.scheduledAt).toLocaleString()}</strong>?
              The patient will be notified.
            </>
          ) : null
        }
      />
    </main>
  );
}
