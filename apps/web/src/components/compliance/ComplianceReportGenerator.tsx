'use client';

import { useState } from 'react';
import type { ComplianceReport } from './types';

interface ComplianceReportGeneratorProps {
  reports?: ComplianceReport[];
  onGenerate?: (
    reportType: ComplianceReport['reportType'],
    period: { startDate: string; endDate: string }
  ) => Promise<void>;
}

export function ComplianceReportGenerator({
  reports = [],
  onGenerate,
}: ComplianceReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    reportType: 'comprehensive' as ComplianceReport['reportType'],
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onGenerate) return;

    setIsGenerating(true);
    try {
      await onGenerate(formData.reportType, {
        startDate: formData.startDate,
        endDate: formData.endDate,
      });
      setShowForm(false);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Compliance Reports</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Generate compliance reports in seconds
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate Report
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleGenerate}
          className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10"
        >
          <select
            value={formData.reportType}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                reportType: e.target.value as ComplianceReport['reportType'],
              }))
            }
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          >
            <option value="hipaa">HIPAA Report</option>
            <option value="privacy">Privacy Report</option>
            <option value="security">Security Report</option>
            <option value="comprehensive">Comprehensive Report</option>
          </select>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isGenerating}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {reports.length > 0 ? (
          reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex-1">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">{report.title}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {new Date(report.period.startDate).toLocaleDateString()} -{' '}
                  {new Date(report.period.endDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <span
                  className={`inline-block rounded px-2 py-1 text-xs font-medium ${report.status === 'final' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'}`}
                >
                  {report.status}
                </span>
                {report.fileName && (
                  <button className="text-xs text-blue-600 hover:underline">Download</button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            No reports generated yet
          </p>
        )}
      </div>
    </div>
  );
}
