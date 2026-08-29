'use client';

interface Appointment {
  id: string;
  type: string;
  provider: string;
  scheduledAt: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

interface AppointmentTimelineProps {
  appointments: Appointment[];
  loading?: boolean;
}

export function AppointmentTimeline({ appointments, loading }: AppointmentTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No upcoming appointments</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '✓';
      case 'scheduled':
        return '📅';
      case 'completed':
        return '✓✓';
      case 'cancelled':
        return '✕';
      default:
        return '◯';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300';
      case 'scheduled':
        return 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300';
      case 'completed':
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
      case 'cancelled':
        return 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  return (
    <div className="space-y-3">
      {appointments.map((apt) => {
        const date = new Date(apt.scheduledAt);
        const isUpcoming = date > new Date();

        return (
          <div
            key={apt.id}
            className="relative flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${getStatusColor(apt.status)} text-sm font-bold`}>
              {getStatusIcon(apt.status)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-neutral-900 dark:text-neutral-50">{apt.type}</h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{apt.provider}</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {isUpcoming && apt.status === 'scheduled' && (
              <div className="flex-shrink-0 text-xs font-medium text-warning-700 dark:text-warning-300">
                Confirm
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
