'use client';

interface Vaccination {
  id: string;
  name: string;
  dateAdministered: string;
  nextDueDate?: string;
  status: 'completed' | 'due' | 'overdue';
}

interface VaccinationStatusProps {
  vaccinations: Vaccination[];
  loading?: boolean;
}

export function VaccinationStatus({ vaccinations, loading }: VaccinationStatusProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        ))}
      </div>
    );
  }

  const overdue = vaccinations.filter((v) => v.status === 'overdue');
  const due = vaccinations.filter((v) => v.status === 'due');
  const completed = vaccinations.filter((v) => v.status === 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300';
      case 'due':
        return 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300';
      case 'overdue':
        return 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓ Up to date';
      case 'due':
        return '📅 Due soon';
      case 'overdue':
        return '⚠️ Overdue';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div>
          <h4 className="text-danger-700 dark:text-danger-300 mb-2 text-xs font-semibold">
            Overdue
          </h4>
          <div className="space-y-2">
            {overdue.map((vac) => (
              <div
                key={vac.id}
                className={`rounded-lg px-3 py-2 text-sm ${getStatusColor(vac.status)}`}
              >
                <div className="font-medium">{vac.name}</div>
                <div className="text-xs opacity-80">
                  Due: {new Date(vac.nextDueDate!).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {due.length > 0 && (
        <div>
          <h4 className="text-warning-700 dark:text-warning-300 mb-2 text-xs font-semibold">
            Due Soon
          </h4>
          <div className="space-y-2">
            {due.map((vac) => (
              <div
                key={vac.id}
                className={`rounded-lg px-3 py-2 text-sm ${getStatusColor(vac.status)}`}
              >
                <div className="font-medium">{vac.name}</div>
                <div className="text-xs opacity-80">
                  Due: {new Date(vac.nextDueDate!).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h4 className="text-success-700 dark:text-success-300 mb-2 text-xs font-semibold">
            Up to Date
          </h4>
          <div className="space-y-2">
            {completed.slice(0, 3).map((vac) => (
              <div
                key={vac.id}
                className={`rounded-lg px-3 py-2 text-sm ${getStatusColor(vac.status)}`}
              >
                <div className="font-medium">{vac.name}</div>
                <div className="text-xs opacity-80">
                  {new Date(vac.dateAdministered).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vaccinations.length === 0 && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No vaccination records</p>
        </div>
      )}
    </div>
  );
}
