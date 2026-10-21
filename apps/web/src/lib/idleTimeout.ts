/**
 * Automatic logoff after inactivity — HIPAA §164.312(a)(2)(iii) (issue #1495).
 */

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
export const DEFAULT_WARNING_SECONDS = 60;

/** BroadcastChannel name used to keep every open tab's idle clock in sync. */
export const SESSION_CHANNEL = 'hw-session';

export type SessionMessage = { type: 'activity'; at: number } | { type: 'logout' };

export type IdlePhase = 'active' | 'warning' | 'expired';

export interface IdleState {
  phase: IdlePhase;
  /** Whole seconds until automatic logoff (0 once expired) */
  secondsLeft: number;
}

export function getIdleState(
  now: number,
  lastActivityAt: number,
  timeoutMs: number,
  warningMs: number
): IdleState {
  const remainingMs = lastActivityAt + timeoutMs - now;
  if (remainingMs <= 0) return { phase: 'expired', secondsLeft: 0 };
  const secondsLeft = Math.ceil(remainingMs / 1000);
  return { phase: remainingMs <= warningMs ? 'warning' : 'active', secondsLeft };
}
