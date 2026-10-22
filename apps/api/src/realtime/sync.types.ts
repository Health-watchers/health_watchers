/**
 * Real-time data synchronization — shared types
 * Issue #1254
 *
 * The definitions live in @health-watchers/types (#1504) so the web and mobile
 * clients and docs/REALTIME_EVENTS.md share them with the API.
 */
export type {
  SyncChange,
  SequencedChange,
  ConflictResolution,
  ApplyResult,
  ReconcileRequest,
  ReconcileResponse,
} from '@health-watchers/types';
