'use client';

import { useState } from 'react';
import type { BreachIncident } from './types';

interface BreachIncidentReporterProps {
  incidents?: BreachIncident[];
  onReport?: (incident: Partial<BreachIncident>) => Promise<void>;
}

const SEVERITY_COLORS: Record<BreachIncident['severity'], string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

const STATUS_COLORS: Record<BreachIncident['status'], string> = {
  investigating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  contained: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200',
};

export function BreachIncidentReporter({ incidents = [], onReport }: BreachIncidentReporterProps) {
  const [isReporting, setIsReporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium' as BreachIncident['severity'],
    affectedRecords: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onReport) return;

    setIsReporting(true);
    try {
      await onReport({
        ...formData,
        detectedAt: new Date().toISOString(),
        status: 'investigating',
      });
      setFormData({ title: '', description: '', severity: 'medium', affectedRecords: 0 });
      setShowForm(false);
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Breach Incidents</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Report and track security breaches</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Report Incident
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
          <input
            type="text"
            placeholder="Incident Title"
            value={formData.title}
            onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            required
          />
          <textarea
            placeholder="Incident Description"
            value={formData.description}
            onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            required
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={formData.severity}
              onChange={(e) =>
                setFormData((f) => ({ ...f, severity: e.target.value as BreachIncident['severity'] }))
              }
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            >
              <option value="low">Low Severity</option>
              <option value="medium">Medium Severity</option>
              <option value="high">High Severity</option>
              <option value="critical">Critical Severity</option>
            </select>
            <input
              type="number"
              placeholder="Affected Records"
              value={formData.affectedRecords}
              onChange={(e) => setFormData((f) => ({ ...f, affectedRecords: parseInt(e.target.value) }))}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              min="0"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isReporting}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isReporting ? 'Reporting...' : 'Submit Report'}
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
        {incidents.length > 0 ? (
          incidents.map((incident) => (
            <div key={incident.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{incident.title}</h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{incident.description}</p>
                  <div className="mt-2 flex gap-2">
                    <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity}
                    </span>
                    <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[incident.status]}`}>
                      {incident.status}
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-neutral-600 dark:text-neutral-400">
                  <div>{incident.affectedRecords} records</div>
                  <div>{new Date(incident.detectedAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">No incidents reported</p>
        )}
      </div>
    </div>
  );
}
