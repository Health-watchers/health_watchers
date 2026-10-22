'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  DEFAULT_WARNING_SECONDS,
  SESSION_CHANNEL,
  SessionMessage,
  getIdleState,
} from '@/lib/idleTimeout';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
// Throttle cross-tab activity broadcasts — one message per window is enough
const BROADCAST_THROTTLE_MS = 5_000;
const TICK_MS = 1_000;

/**
 * Signs staff out after the clinic's configured idle timeout (default 15 min), showing a
 * warning modal 60s before. Activity in any open tab keeps every tab signed in; a logout in
 * one tab signs out all of them. Logging out clears the query cache so no PHI stays on screen.
 */
export function SessionTimeoutWarning() {
  const { user, logout } = useAuth();
  const [policy, setPolicy] = useState({
    timeoutMs: DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000,
    warningMs: DEFAULT_WARNING_SECONDS * 1000,
  });
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_WARNING_SECONDS);

  const lastActivityRef = useRef(Date.now());
  const lastBroadcastRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const warningRef = useRef(false);
  const loggingOutRef = useRef(false);
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  const signedIn = !!user;

  // Load the clinic's idle timeout once signed in
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch('/api/auth/session-policy', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const minutes = body?.data?.idleTimeoutMinutes;
        const seconds = body?.data?.warningSeconds;
        if (cancelled || typeof minutes !== 'number') return;
        setPolicy({
          timeoutMs: minutes * 60_000,
          warningMs: (typeof seconds === 'number' ? seconds : DEFAULT_WARNING_SECONDS) * 1000,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const markActive = useCallback((at: number, broadcast: boolean) => {
    lastActivityRef.current = Math.max(lastActivityRef.current, at);
    warningRef.current = false;
    setShowWarning(false);
    if (broadcast && at - lastBroadcastRef.current >= BROADCAST_THROTTLE_MS) {
      lastBroadcastRef.current = at;
      channelRef.current?.postMessage({ type: 'activity', at } satisfies SessionMessage);
    }
  }, []);

  const expire = useCallback(
    (broadcast: boolean) => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      warningRef.current = false;
      setShowWarning(false);
      if (broadcast) channelRef.current?.postMessage({ type: 'logout' } satisfies SessionMessage);
      void logout({ reason: 'idle_timeout' });
    },
    [logout]
  );

  useEffect(() => {
    if (!signedIn) return;
    loggingOutRef.current = false;
    lastActivityRef.current = Date.now();

    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SESSION_CHANNEL) : null;
    channelRef.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent<SessionMessage>) => {
        if (event.data?.type === 'activity') markActive(event.data.at, false);
        if (event.data?.type === 'logout') expire(false);
      };
    }

    // While the warning is up only the explicit "Stay signed in" button counts as activity
    const onActivity = () => {
      if (!warningRef.current) markActive(Date.now(), true);
    };
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity, { passive: true }));

    const tick = setInterval(() => {
      const state = getIdleState(
        Date.now(),
        lastActivityRef.current,
        policy.timeoutMs,
        policy.warningMs
      );
      if (state.phase === 'expired') {
        expire(true);
      } else if (state.phase === 'warning') {
        warningRef.current = true;
        setShowWarning(true);
        setSecondsLeft(state.secondsLeft);
      } else if (warningRef.current) {
        warningRef.current = false;
        setShowWarning(false);
      }
    }, TICK_MS);

    return () => {
      clearInterval(tick);
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity));
      channel?.close();
      channelRef.current = null;
    };
  }, [signedIn, policy, markActive, expire]);

  useEffect(() => {
    if (showWarning) stayButtonRef.current?.focus();
  }, [showWarning]);

  if (!signedIn || !showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800"
      >
        <h2
          id="session-timeout-title"
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Are you still there?
        </h2>
        <p id="session-timeout-description" className="mt-2 text-neutral-600 dark:text-neutral-400">
          For patient privacy you will be signed out in{' '}
          <span className="font-bold" aria-live="polite">
            {secondsLeft} {secondsLeft === 1 ? 'second' : 'seconds'}
          </span>{' '}
          due to inactivity.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={() => expire(true)} className="flex-1">
            Sign out
          </Button>
          <Button
            ref={stayButtonRef}
            variant="primary"
            onClick={() => {
              lastBroadcastRef.current = 0; // always tell the other tabs
              markActive(Date.now(), true);
            }}
            className="flex-1"
          >
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  );
}
