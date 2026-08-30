'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui';

interface UpcomingAppointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: string;
  chiefComplaint?: string;
  isTelemedicine?: boolean;
  patientId?: { firstName?: string; lastName?: string };
  doctorId?: { firstName?: string; lastName?: string };
}

interface AppointmentWidgetProps {
  appointments: UpcomingAppointment[];
  showViewAll?: boolean;
}

const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  scheduled: 'bg-blue-100 text-blue-800',
  patient_arrived: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-neutral-100 text-neutral-500',
  completed: 'bg-green-100 text-green-700',
};

export function AppointmentWidget({ appointments, showViewAll = true }: AppointmentWidgetProps) {
  return (
    <section
      aria-label="Upcoming appointments widget"
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-700">
          Upcoming Appointments (Next 7 Days)
        </h2>
        {showViewAll && (
          <Link href="/appointments" className="text-xs text-indigo-600 hover:underline">
            View all →
          </Link>
        )}
      </div>

      {appointments.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-neutral-400">No upcoming appointments</p>
          <Link
            href="/appointments"
            className="mt-3 inline-block text-xs text-indigo-600 hover:underline"
          >
            Schedule an appointment
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100" role="list">
          {appointments.slice(0, 5).map((apt) => {
            const patientName = apt.patientId
              ? `${apt.patientId.firstName ?? ''} ${apt.patientId.lastName ?? ''}`.trim()
              : 'Unknown patient';
            const doctorName = apt.doctorId
              ? `${apt.doctorId.firstName ?? ''} ${apt.doctorId.lastName ?? ''}`.trim()
              : 'Unassigned';
            const time = new Date(apt.scheduledAt);

            return (
              <li
                key={apt._id}
                className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-[80px] text-xs text-neutral-500">
                  <div className="font-medium text-neutral-800">
                    {time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs">
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate font-medium text-neutral-800">
                    {apt.type} {apt.isTelemedicine && '🎥'}
                  </p>
                  <p className="truncate text-xs capitalize text-neutral-500">
                    {patientName} with {doctorName}
                    {apt.chiefComplaint && ` — ${apt.chiefComplaint}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[apt.status] ?? 'bg-neutral-100 text-neutral-600'}`}
                >
                  {apt.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {appointments.length > 5 && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <p className="text-xs text-neutral-600">
            +{appointments.length - 5} more appointment{appointments.length - 5 !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
