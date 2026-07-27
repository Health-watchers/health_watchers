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
      <div className="text-center py-8">
        <p className="text-sm text-gray-500">No version history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((version, index) => (
        <div
          key={version.id}
          className="rounded-md border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
        >
          <button
            onClick={() => setExpandedId(expandedId === version.id ? null : version.id)}
            className="w-full text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900">{version.author}</p>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                    v{versions.length - index}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{formatDate(version.updatedAt)}</p>
              </div>
              <span className="text-gray-400 text-lg">{expandedId === version.id ? '▼' : '▶'}</span>
            </div>
          </button>

          {expandedId === version.id && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Summary</p>
                <p className="text-sm text-gray-700">{version.summary}</p>
              </div>

              {version.changes && version.changes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Changes</p>
                  <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
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
