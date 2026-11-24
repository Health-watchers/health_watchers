'use client';

import { useState, useMemo } from 'react';
import type { AuditLog } from './types';

interface AuditLogViewerProps {
  logs?: AuditLog[];
  onExport?: () => Promise<void>;
}

export function AuditLogViewer({ logs = [], onExport }: AuditLogViewerProps) {
  const [filters, setFilters] = useState({
    action: '',
    status: '' as 'success' | 'failure' | '',
    actor: '',
  });
  const [isExporting, setIsExporting] = useState(false);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filters.action && !log.action.toLowerCase().includes(filters.action.toLowerCase())) {
        return false;
      }
      if (filters.status && log.status !== filters.status) {
        return false;
      }
      if (filters.actor && !log.actor.toLowerCase().includes(filters.actor.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, filters]);

  const handleExport = async () => {
    if (!onExport) return;
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audit Logs</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Immutable and timestamped audit trail
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Filter by action..."
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
          <input
            type="text"
            placeholder="Filter by actor..."
            value={filters.actor}
            onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: (e.target.value as 'success' | 'failure' | '') || '',
              }))
            }
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
              <th className="px-4 py-3 text-left font-medium text-neutral-900 dark:text-neutral-100">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-900 dark:text-neutral-100">
                Action
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-900 dark:text-neutral-100">
                Actor
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-900 dark:text-neutral-100">
                Target
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-900 dark:text-neutral-100">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900/50"
                >
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{log.actor}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{log.target}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                        log.status === 'success'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-600 dark:text-neutral-400"
                >
                  No audit logs match the selected filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
