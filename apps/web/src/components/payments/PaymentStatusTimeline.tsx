'use client';

import { Check, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface StatusEvent {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'disputed';
  timestamp: Date;
  description: string;
  details?: string;
}

interface PaymentStatusTimelineProps {
  events: StatusEvent[];
  currentStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'disputed';
}

export function PaymentStatusTimeline({ events, currentStatus }: PaymentStatusTimelineProps) {
  const statusIcons = {
    pending: Clock,
    processing: Clock,
    completed: CheckCircle,
    failed: AlertCircle,
    disputed: AlertCircle,
  };

  const statusColors = {
    pending: 'text-yellow-500',
    processing: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
    disputed: 'text-orange-500',
  };

  const statusBgColors = {
    pending: 'bg-yellow-50 dark:bg-yellow-900/20',
    processing: 'bg-blue-50 dark:bg-blue-900/20',
    completed: 'bg-green-50 dark:bg-green-900/20',
    failed: 'bg-red-50 dark:bg-red-900/20',
    disputed: 'bg-orange-50 dark:bg-orange-900/20',
  };

  const statusBorderColors = {
    pending: 'border-yellow-200 dark:border-yellow-700',
    processing: 'border-blue-200 dark:border-blue-700',
    completed: 'border-green-200 dark:border-green-700',
    failed: 'border-red-200 dark:border-red-700',
    disputed: 'border-orange-200 dark:border-orange-700',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Transaction Timeline
      </h3>

      <div className="space-y-4">
        {events.length > 0 ? (
          events.map((event, index) => {
            const Icon = statusIcons[event.status];
            const isCompleted = ['completed'].includes(event.status);
            const isFailed = ['failed', 'disputed'].includes(event.status);

            return (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`rounded-full p-2 ${statusBgColors[event.status]}`}
                  >
                    <Icon className={`h-5 w-5 ${statusColors[event.status]}`} />
                  </div>
                  {index < events.length - 1 && (
                    <div
                      className={`my-2 h-8 w-1 ${
                        isCompleted
                          ? 'bg-green-300'
                          : isFailed
                            ? 'bg-red-300'
                            : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                  )}
                </div>

                <div className="flex-1 pb-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {event.description}
                      </p>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                    {event.details && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{event.details}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400">No transaction events yet</p>
        )}
      </div>

      {currentStatus && (
        <div className={`mt-6 rounded-lg border ${statusBorderColors[currentStatus]} ${statusBgColors[currentStatus]} p-4`}>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Current Status:{' '}
            <span className={`font-semibold ${statusColors[currentStatus]}`}>
              {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
