'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { authJson } from '@/lib/authJson';
import { refreshAccessToken } from '@/lib/auth';
import { useAuth, type AppRole } from '@/context/AuthContext';

export const INBOX_ROLES: AppRole[] = [
  'SUPER_ADMIN',
  'CLINIC_ADMIN',
  'DOCTOR',
  'NURSE',
  'ASSISTANT',
];

export const inboxKeys = {
  all: ['inbox'] as const,
  unread: () => ['inbox', 'unread'] as const,
  threads: (filters: Record<string, unknown>) => ['inbox', 'threads', filters] as const,
  thread: (id: string) => ['inbox', 'thread', id] as const,
  staff: () => ['inbox', 'staff'] as const,
};

/** Events that change what the inbox shows. All are emitted to the clinic room by the API. */
const SOCKET_EVENTS = ['portal:message:new', 'inbox:thread:updated', 'inbox:unread:changed'];

const CHANNEL_NAME = 'hw-care-team-inbox';

export interface NewMessageEvent {
  messageId: string;
  threadId: string;
  patientId: string;
  subject: string;
  body: string;
  direction: 'patient_to_staff' | 'staff_to_patient';
  createdAt: string;
}

// ── One realtime subscription per tab, shared by every component that needs it ─────────────

let subscribers = 0;
let teardown: (() => void) | null = null;
const messageListeners = new Set<(e: NewMessageEvent) => void>();

async function fetchSocketToken(): Promise<string | null> {
  const res = await fetch('/api/auth/socket-token', { credentials: 'include', cache: 'no-store' });
  if (res.ok) return (await res.json()).token ?? null;
  if (res.status === 401 && (await refreshAccessToken())) return fetchSocketToken();
  return null;
}

function invalidateInbox(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: inboxKeys.all });
}

function start(queryClient: QueryClient) {
  let cancelled = false;
  let socket: Socket | null = null;

  const onEvent = () => invalidateInbox(queryClient);
  const onNewMessage = (e: NewMessageEvent) => messageListeners.forEach((l) => l(e));
  // Access tokens are short-lived; fetch a fresh one when the handshake is rejected
  const onConnectError = async () => {
    const token = await fetchSocketToken();
    if (!cancelled && token && socket) {
      socket.auth = { token };
      socket.connect();
    }
  };

  // Another tab changed inbox state (read, replied, assigned) — refresh this tab's view too
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  if (channel) channel.onmessage = onEvent;

  // Catch up after the tab was hidden or offline
  const onVisible = () => {
    if (document.visibilityState === 'visible') invalidateInbox(queryClient);
  };
  document.addEventListener('visibilitychange', onVisible);

  (async () => {
    const token = await fetchSocketToken();
    if (cancelled || !token) return;
    const { getSocket } = await import('@/lib/socket');
    if (cancelled) return;
    socket = getSocket(token);
    SOCKET_EVENTS.forEach((e) => socket!.on(e, onEvent));
    socket.on('portal:message:new', onNewMessage);
    socket.on('connect_error', onConnectError);
    socket.on('connect', onEvent); // refetch after reconnects so nothing is missed
  })();

  return () => {
    cancelled = true;
    if (socket) {
      SOCKET_EVENTS.forEach((e) => socket!.off(e, onEvent));
      socket.off('portal:message:new', onNewMessage);
      socket.off('connect_error', onConnectError);
      socket.off('connect', onEvent);
    }
    channel?.close();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Keeps inbox queries live via Socket.IO and in sync with other open tabs. */
export function useInboxRealtime(enabled = true, onNewMessage?: (e: NewMessageEvent) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    subscribers += 1;
    if (subscribers === 1) teardown = start(queryClient);
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        teardown?.();
        teardown = null;
      }
    };
  }, [enabled, queryClient]);

  useEffect(() => {
    if (!enabled || !onNewMessage) return;
    messageListeners.add(onNewMessage);
    return () => {
      messageListeners.delete(onNewMessage);
    };
  }, [enabled, onNewMessage]);
}

/** Tell other tabs that inbox state changed locally (they also hear the socket event, but a
 *  tab whose socket is reconnecting would otherwise lag). */
export function broadcastInboxChange() {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.postMessage({ type: 'changed', at: Date.now() });
  ch.close();
}

/** Number of threads with unread patient messages — drives the Sidebar badge. */
export function useInboxUnreadCount() {
  const { user } = useAuth();
  const enabled = !!user && INBOX_ROLES.includes(user.role);
  useInboxRealtime(enabled);

  const { data } = useQuery({
    queryKey: inboxKeys.unread(),
    queryFn: () => authJson<{ threads: number; messages: number }>('/inbox/unread-count'),
    enabled,
    // Socket events are the primary signal; the interval is a safety net
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  return enabled ? (data?.threads ?? 0) : 0;
}
