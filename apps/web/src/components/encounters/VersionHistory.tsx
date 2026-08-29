'use client';

import { useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

interface Version {
  id: string;
  author: string;
  updatedAt: string;
  summary: string;
  changes?: string[];
}

interface VersionHistoryProps {
  encounterId: string;
  versions: Version[];
  onVersionRestore?: (versionId: string) => Promise<void>;
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function VersionHistory({ encounterId, versions, onVersionRestore }: VersionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestoreVersion = async (versionId: string) => {
    if (!onVersionRestore) return;
    setRestoringId(versionId);
    try {
      await onVersionRestore(versionId);
    } finally {
      setRestoringId(null);
    }
  };

  if (!versions || versions.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">No version history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((version, index) => (
        <div
          key={version.id}
          className="rounded-md border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50"
        >
          <button
            onClick={() => setExpandedId(expandedId === version.id ? null : version.id)}
            className="w-full text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{version.author}</p>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    v{versions.length - index}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{formatDate(version.updatedAt)}</p>
              </div>
              <span className="text-lg text-gray-400">{expandedId === version.id ? '▼' : '▶'}</span>
            </div>
          </button>

          {expandedId === version.id && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-600">Summary</p>
                <p className="text-sm text-gray-700">{version.summary}</p>
              </div>

              {version.changes && version.changes.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-600">Changes</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                    {version.changes.map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              {index > 0 && (
                <button
                  onClick={() => handleRestoreVersion(version.id)}
                  disabled={restoringId === version.id}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  {restoringId === version.id ? 'Restoring...' : 'Restore this version'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
