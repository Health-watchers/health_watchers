'use client';

import type { EmployeeTraining as EmployeeTrainingType } from './types';

interface EmployeeTrainingProps {
  trainings?: EmployeeTrainingType[];
  onMarkComplete?: (trainingId: string) => Promise<void>;
}

const TRAINING_LABELS: Record<EmployeeTrainingType['trainingType'], string> = {
  hipaa: 'HIPAA Training',
  privacy: 'Privacy Training',
  security: 'Security Training',
  compliance: 'Compliance Training',
};

const STATUS_COLORS: Record<EmployeeTrainingType['status'], string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

export function EmployeeTraining({ trainings = [], onMarkComplete }: EmployeeTrainingProps) {
  const handleMarkComplete = async (trainingId: string) => {
    if (!onMarkComplete) return;

    try {
      await onMarkComplete(trainingId);
    } catch (error) {
      console.error('Failed to mark training complete:', error);
    }
  };

  const grouped = trainings.reduce(
    (acc, training) => {
      const status = training.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(training);
      return acc;
    },
    {} as Record<EmployeeTrainingType['status'], EmployeeTrainingType[]>
  );

  const statusOrder: EmployeeTrainingType['status'][] = [
    'expired',
    'pending',
    'in_progress',
    'completed',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Employee Training</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Track compliance training completion
        </p>
      </div>

      {statusOrder.map((status) => {
        const items = grouped[status];
        if (!items || items.length === 0) return null;

        return (
          <div key={status} className="space-y-3">
            <h4 className="font-medium capitalize text-neutral-900 dark:text-neutral-100">
              {status === 'in_progress' ? 'In Progress' : status}
            </h4>

            <div className="space-y-2">
              {items.map((training) => (
                <div
                  key={training.id}
                  className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        {TRAINING_LABELS[training.trainingType]}
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Employee: {training.employeeId}
                      </p>
                      {training.certificateUrl && (
                        <a
                          href={training.certificateUrl}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View Certificate
                        </a>
                      )}
                    </div>

                    <div className="text-right text-xs text-neutral-600 dark:text-neutral-400">
                      <span
                        className={`inline-block rounded px-2 py-1 font-medium ${STATUS_COLORS[status]}`}
                      >
                        {status}
                      </span>
                      {training.completedAt && (
                        <div className="mt-1">
                          {new Date(training.completedAt).toLocaleDateString()}
                        </div>
                      )}
                      {training.expiryDate && (
                        <div>Expires: {new Date(training.expiryDate).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>

                  {status === 'pending' && (
                    <button
                      onClick={() => handleMarkComplete(training.id)}
                      className="mt-3 w-full rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Mark as Completed
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {trainings.length === 0 && (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          No training records found
        </p>
      )}
    </div>
  );
}
