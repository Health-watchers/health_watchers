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

interface RecognisedDevice {
  id: string;
  deviceLabel: string;
  countries: { code: string; name: string | null }[];
  lastLocation: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

async function fetchDevices(): Promise<RecognisedDevice[]> {
  const res = await fetch('/api/v1/users/devices');
  if (!res.ok) throw new Error('Failed to load recognised devices');
  const body = await res.json();
  return body.data || [];
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
      <RecognisedDevices />
    </div>
  );
}

/**
 * Devices this account has signed in from (#1497). A sign-in from a device or
 * country not listed here sends an email and in-app security alert.
 */
function RecognisedDevices() {
  const {
    data: devices = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['recognised-devices'],
    queryFn: fetchDevices,
  });

  return (
    <section className="space-y-4 pt-4" aria-labelledby="recognised-devices-heading">
      <div>
        <h3 id="recognised-devices-heading" className="text-lg font-semibold text-neutral-900">
          Recognised Devices
        </h3>
        <p className="text-sm text-neutral-500">
          You&apos;ll get an alert when your account is used from a device or country that
          isn&apos;t on this list.
        </p>
      </div>
      {isLoading ? (
        <div className="text-sm text-neutral-500">Loading devices...</div>
      ) : error ? (
        <div className="text-danger-500 text-sm">Failed to load recognised devices</div>
      ) : devices.length === 0 ? (
        <div className="text-sm text-neutral-500">No devices recorded yet.</div>
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <li key={device.id} className="rounded-lg border border-neutral-200 p-4">
              <p className="text-sm font-medium text-neutral-900">{device.deviceLabel}</p>
              {device.countries.length > 0 && (
                <p className="text-xs text-neutral-500">
                  Locations: {device.countries.map((c) => c.name ?? c.code).join(', ')}
                </p>
              )}
              <p className="text-xs text-neutral-500">
                First seen {new Date(device.firstSeenAt).toLocaleDateString()} · Last sign-in{' '}
                {new Date(device.lastSeenAt).toLocaleString()}
                {device.lastLocation ? ` from ${device.lastLocation}` : ''}
              </p>
              {device.isCurrent && (
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                  This device
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
