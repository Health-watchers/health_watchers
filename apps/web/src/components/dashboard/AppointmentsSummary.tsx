import Link from 'next/link';
import { Card } from '@/components/ui';

interface UpcomingAppointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
  patientId?: { firstName?: string; lastName?: string } | null;
}

interface AppointmentsData {
  todayTotal: number;
  scheduled: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  upcoming: UpcomingAppointment[];
}

interface AppointmentsSummaryProps {
  data: AppointmentsData;
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-600',
  'no-show': 'bg-yellow-100 text-yellow-700',
};

export function AppointmentsSummary({ data }: AppointmentsSummaryProps) {
  return (
    <Card className="flex flex-col gap-4 p-4" role="region" aria-label="Appointments summary">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          📅 Today's Appointments
        </h2>
        <Link
          href="/appointments"
          className="text-xs text-primary-600 hover:underline focus:outline-none focus-visible:underline"
          aria-label="View all appointments"
        >
          View all
        </Link>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Scheduled', value: data.scheduled, color: 'text-blue-600' },
          { label: 'Confirmed', value: data.confirmed, color: 'text-green-600' },
          { label: 'Completed', value: data.completed, color: 'text-gray-600' },
          { label: 'Cancelled', value: data.cancelled, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md bg-neutral-50 p-2 text-center dark:bg-neutral-800">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming list */}
      {data.upcoming.length > 0 ? (
        <ul className="space-y-2" aria-label="Upcoming appointments">
          {data.upcoming.map((appt) => {
            const name = appt.patientId
              ? `${appt.patientId.firstName ?? ''} ${appt.patientId.lastName ?? ''}`.trim()
              : 'Unknown Patient';
            const time = new Date(appt.scheduledAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const day = new Date(appt.scheduledAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            });
            return (
              <li
                key={appt._id}
                className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm dark:border-neutral-700"
              >
                <div>
                  <p className="font-medium text-neutral-800 dark:text-neutral-100">{name}</p>
                  <p className="text-xs text-neutral-500 capitalize">{appt.type}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    {day} · {time}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusColors[appt.status] ?? 'bg-neutral-100 text-neutral-600'}`}
                  >
                    {appt.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-center text-sm text-neutral-400">No upcoming appointments this week</p>
      )}
    </Card>
  );
}
