'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Session {
  id: string;
  userAgent: string;
  ipAddress: string;
  lastActivity: string;
  createdAt: string;
  isCurrent: boolean;
}

async function fetchSessions(): Promise<Session[]> {
  const res = await fetch('/api/v1/users/sessions');
  if (!res.ok) throw new Error('Failed to load sessions');
  const body = await res.json();
  return body.data || [];
}

async function revokeSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/v1/users/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to revoke session');
}

export function SessionManagement() {
  const queryClient = useQueryClient();
  const {
    data: sessions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  if (isLoading) return <div className="text-sm text-neutral-500">Loading sessions...</div>;
  if (error) return <div className="text-danger-500 text-sm">Failed to load sessions</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-neutral-900">Active Sessions</h3>
      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-900">
                {session.userAgent || 'Unknown Device'}
              </p>
              <p className="text-xs text-neutral-500">{session.ipAddress}</p>
              <p className="text-xs text-neutral-500">
                Last active: {new Date(session.lastActivity).toLocaleString()}
              </p>
              {session.isCurrent && (
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                  Current Session
                </span>
              )}
            </div>
            {!session.isCurrent && (
              <button
                onClick={() => revokeMutation.mutate(session.id)}
                disabled={revokeMutation.isPending}
                className="bg-danger-50 text-danger-600 hover:bg-danger-100 ml-4 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
