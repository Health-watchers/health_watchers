'use client';

import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

export interface LabResult {
  id: string;
  testName: string;
  value: number;
  unit: string;
  referenceMin: number;
  referenceMax: number;
  testDate: Date;
  status: 'normal' | 'low' | 'high' | 'critical';
  notes?: string;
  previousValue?: number;
}

interface LabResultsTableProps {
  results: LabResult[];
  isLoading?: boolean;
  onRowClick?: (result: LabResult) => void;
}

export function LabResultsTable({ results, isLoading = false, onRowClick }: LabResultsTableProps) {
  const getStatusBadge = (status: LabResult['status']) => {
    const statusConfig = {
      normal: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-800 dark:text-green-200',
        label: 'Normal',
      },
      low: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-800 dark:text-yellow-200',
        label: 'Low',
      },
      high: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-800 dark:text-orange-200',
        label: 'High',
      },
      critical: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-800 dark:text-red-200',
        label: 'Critical',
      },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${config.bg} ${config.text}`}
      >
        {config.label}
      </span>
    );
  };

  const getTrendIcon = (current: number, previous?: number) => {
    if (!previous) return null;

    if (current > previous) {
      return <TrendingUp className="h-4 w-4 text-orange-500" />;
    } else if (current < previous) {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return null;
  };

  const isAbnormal = (status: LabResult['status']) => status !== 'normal';

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-gray-100 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No lab results available</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
              Test Name
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
              Result
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
              Reference Range
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
              Status
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
              Date
            </th>
            <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
              Trend
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {results.map((result) => (
            <tr
              key={result.id}
              onClick={() => onRowClick?.(result)}
              className={`transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''
              } ${isAbnormal(result.status) ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}
            >
              <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-2">
                  {isAbnormal(result.status) && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                  {result.testName}
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                <span className="font-semibold">
                  {result.value} {result.unit}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                {result.referenceMin} - {result.referenceMax} {result.unit}
              </td>
              <td className="px-6 py-4 text-sm">{getStatusBadge(result.status)}</td>
              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                {formatDate(result.testDate)}
              </td>
              <td className="px-6 py-4 text-center">
                {getTrendIcon(result.value, result.previousValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {results.some((r) => isAbnormal(r.status)) && (
        <div className="border-t border-gray-200 bg-yellow-50 px-6 py-3 dark:border-gray-700 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="mr-2 inline-block h-4 w-4" />
            Some results are outside the normal range. Please consult with your healthcare provider.
          </p>
        </div>
      )}
    </div>
  );
}
