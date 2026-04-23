'use client';

import { useState, useEffect } from 'react';

interface Appointment {
  _id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  chiefComplaint?: string;
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

export default function AppointmentsClient({ labels }: { labels: Labels }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(new Date());
  const [doctorFilter, setDoctorFilter] = useState('');

  const weekDays = getWeekDays(anchor);
  const dateFrom = weekDays[0].toISOString();
  const dateTo = weekDays[6].toISOString();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ dateFrom, dateTo, limit: '200' });
    if (doctorFilter) params.set('doctorId', doctorFilter);

    fetch(`http://localhost:3001/api/v1/appointments?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setAppointments(d?.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo, doctorFilter]);

  const doctors = Array.from(new Set(appointments.map((a) => a.doctorId)));

  const shiftWeek = (n: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + n * 7);
    setAnchor(d);
  };

  return (
    <main id="main-content" style={{ padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '1rem' }}>{labels.title}</h1>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => shiftWeek(-1)}
          aria-label={labels.prevWeek}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          ← {labels.prevWeek}
        </button>
        <button
          onClick={() => setAnchor(new Date())}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          {labels.today}
        </button>
        <button
          onClick={() => shiftWeek(1)}
          aria-label={labels.nextWeek}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          {labels.nextWeek} →
        </button>

        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          aria-label={labels.allDoctors}
          style={{ padding: '0.4rem', marginLeft: 'auto' }}
        >
          <option value="">{labels.allDoctors}</option>
          {doctors.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          fontSize: '0.8rem',
        }}
      >
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: c,
                display: 'inline-block',
              }}
            />
            {(labels as any)[s === 'no-show' ? 'noShow' : s]}
          </span>
        ))}
      </div>

      {loading ? (
        <p role="status" aria-live="polite">
          {labels.loading}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            role="grid"
            aria-label={labels.title}
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}
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
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: isToday ? '#eff6ff' : '#f9fafb',
                        fontWeight: isToday ? 700 : 500,
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
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        verticalAlign: 'top',
                        minHeight: 80,
                      }}
                    >
                      {dayAppts.length === 0 ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>
                      ) : (
                        dayAppts.map((appt) => (
                          <div
                            key={appt._id}
                            role="article"
                            aria-label={`${appt.type} at ${new Date(appt.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            style={{
                              background: STATUS_COLORS[appt.status] ?? '#6b7280',
                              color: '#fff',
                              borderRadius: 4,
                              padding: '0.25rem 0.4rem',
                              marginBottom: '0.3rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>
                              {new Date(appt.scheduledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              ({appt.duration}m)
                            </div>
                            <div style={{ opacity: 0.9 }}>{appt.type}</div>
                            {appt.chiefComplaint && (
                              <div
                                style={{
                                  opacity: 0.8,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 120,
                                }}
                              >
                                {appt.chiefComplaint}
                              </div>
                            )}
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

      {!loading && appointments.length === 0 && (
        <p role="status" style={{ marginTop: '1rem', color: '#6b7280' }}>
          {labels.empty}
        </p>
      )}
    </main>
  );
}
