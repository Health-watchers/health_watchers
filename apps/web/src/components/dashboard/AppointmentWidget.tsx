'use client';

import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';

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
  const t = useTranslations('dashboard.appointments');
  const tStatus = useTranslations('status');
  const format = useFormatter();

  return (
    <section
      aria-label={t('aria')}
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-700">{t('title')}</h2>
        {showViewAll && (
          <Link href="/appointments" className="text-xs text-indigo-600 hover:underline">
            {t('viewAll')}
          </Link>
        )}
      </div>

      {appointments.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-neutral-400">{t('empty')}</p>
          <Link
            href="/appointments"
            className="mt-3 inline-block text-xs text-indigo-600 hover:underline"
          >
            {t('schedule')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100" role="list">
          {appointments.slice(0, 5).map((apt) => {
            const patientName = apt.patientId
              ? `${apt.patientId.firstName ?? ''} ${apt.patientId.lastName ?? ''}`.trim()
              : t('unknownPatient');
            const doctorName = apt.doctorId
              ? `${apt.doctorId.firstName ?? ''} ${apt.doctorId.lastName ?? ''}`.trim()
              : t('unassigned');
            const time = new Date(apt.scheduledAt);

            return (
              <li
                key={apt._id}
                className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-[80px] text-xs text-neutral-500">
                  <div className="font-medium text-neutral-800">
                    {format.dateTime(time, { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs">
                    {format.dateTime(time, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate font-medium text-neutral-800">
                    {apt.type} {apt.isTelemedicine && '🎥'}
                  </p>
                  <p className="truncate text-xs text-neutral-500 capitalize">
                    {t('patientWithDoctor', { patient: patientName, doctor: doctorName })}
                    {apt.chiefComplaint && ` — ${apt.chiefComplaint}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[apt.status] ?? 'bg-neutral-100 text-neutral-600'}`}
                >
                  {tStatus.has(apt.status) ? tStatus(apt.status) : apt.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {appointments.length > 5 && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <p className="text-xs text-neutral-600">
            {t('more', { count: appointments.length - 5 })}
          </p>
        </div>
      )}
    </section>
  );
}
