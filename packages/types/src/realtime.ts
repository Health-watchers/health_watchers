/**
 * Real-time (Socket.IO) event contract — Issue #1504
 *
 * Payload types for every event the API emits or listens for. Shared by the
 * API, web and mobile clients and documented in docs/REALTIME_EVENTS.md.
 *
 * Dates are typed as `string` because they arrive as ISO-8601 strings once
 * serialised over the wire.
 */

// ─── Rooms ────────────────────────────────────────────────────────────────────

/** Rooms a socket is joined to. `clinic:` and `user:` are joined automatically on connect. */
export type RealtimeRoom = `clinic:${string}` | `user:${string}` | `appointment:${string}`;

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * `notification:new` — emitted to `user:<id>`.
 * `createNotification()` sends the full stored notification; the delivery
 * worker sends the subset (`_id`, `type`, `title`, `message`, `link`).
 */
export interface NotificationNewPayload {
  _id: string;
  type: string;
  title?: string;
  message?: string;
  link?: string;
  userId?: string;
  clinicId?: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Appointments ─────────────────────────────────────────────────────────────

/** `appointment:reminder` — emitted to the doctor's and the patient's `user:<id>` rooms. */
export interface AppointmentReminderPayload {
  appointmentId: string;
  timeframe: '24h' | '1h';
  scheduledAt: string;
  /** Present on the doctor's copy. */
  patientName?: string;
  /** Present on the patient's copy. */
  doctorName?: string;
}

/**
 * `appointment:confirmed` | `appointment:cancelled` | `appointment:rescheduled` |
 * `appointment:patient_arrived` — emitted to `appointment:<id>` and `clinic:<id>`.
 * `appointmentId` is always present on the clinic-room copy and is added by the
 * appointment-room emitter as well.
 */
export interface AppointmentStatusPayload {
  appointmentId: string;
  /** Serialised appointment document after the change. */
  appointment: Record<string, unknown>;
  timestamp: string;
  /** `appointment:rescheduled` only. */
  oldScheduledAt?: string;
  newScheduledAt?: string;
  /** `appointment:cancelled` only. */
  cancelledBy?: string;
  cancellationReason?: string;
  /** `appointment:patient_arrived` only. */
  checkedInAt?: string;
}

/** `appointment:checked_in` — emitted to `clinic:<id>` by the kiosk/QR check-in route. */
export interface AppointmentCheckedInPayload {
  appointmentId: string;
  patientId: string;
  timestamp: string;
}

/** `appointment:video_started` — emitted to the doctor's and the patient's `user:<id>` rooms. */
export interface AppointmentVideoStartedPayload {
  appointmentId: string;
  videoRoomId?: string;
  videoRoomUrl?: string;
  recordingConsent: boolean;
}

/** `appointment:video_ended` — emitted to the doctor's and the patient's `user:<id>` rooms. */
export interface AppointmentVideoEndedPayload {
  appointmentId: string;
  /** Duration in minutes. */
  videoDuration: number;
}

// ─── Encounters ───────────────────────────────────────────────────────────────

/** `encounter:created` — emitted to `clinic:<id>` through the transactional outbox. */
export interface EncounterCreatedPayload {
  encounterId: string;
  patientId: string;
}

/** `encounter:updated` — emitted to `clinic:<id>` through the transactional outbox. */
export interface EncounterUpdatedPayload {
  encounterId: string;
}

/** `cosignature:requested` — emitted to the target doctor's `user:<id>` room. */
export interface CosignatureRequestedPayload {
  encounterId: string;
  requestedBy: string;
}

/** `cosignature:completed` — emitted to the requesting doctor's `user:<id>` room. */
export interface CosignatureCompletedPayload {
  encounterId: string;
  coSignedBy: string;
}

/** `cosignature:rejected` — emitted to the requesting doctor's `user:<id>` room. */
export interface CosignatureRejectedPayload {
  encounterId: string;
  rejectedBy: string;
  notes: string;
}

/** `prescription:allergy_warning` — emitted to `clinic:<id>` when an allergy override is used. */
export interface PrescriptionAllergyWarningPayload {
  encounterId: string;
  patientId: string;
  drugName: string;
  allergen: string;
  severity: string;
  reaction?: string;
  overrideReason: string;
}

// ─── Patients, labs, documents ────────────────────────────────────────────────

/** `patient:created` — emitted to `clinic:<id>`. */
export interface PatientCreatedPayload {
  patientId: string;
}

/** `lab:critical` — emitted to the ordering clinician's `user:<id>` and to `clinic:<id>`. */
export interface LabCriticalPayload {
  labResultId: string;
  patientId: string;
  reason: string;
  testName: string;
}

/** `lab:resulted` — emitted to `clinic:<id>` for non-critical results. */
export interface LabResultedPayload {
  labResultId: string;
  patientId: string;
  testName: string;
}

/** `document:uploaded` — emitted to `clinic:<id>` when a patient uploads through the portal. */
export interface DocumentUploadedPayload {
  documentId: string;
  patientId: string;
  fileName: string;
  category: string;
  link: string;
  uploadedAt: string;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/** `portal:message:new` — emitted to `clinic:<id>` and, for staff replies, to the patient's `user:<id>`. */
export interface PortalMessageNewPayload {
  messageId: string;
  threadId: string;
  clinicId: string;
  patientId: string;
  subject: string;
  body: string;
  direction: 'patient_to_staff' | 'staff_to_patient';
  createdAt: string;
  senderRole: string;
}

/** `inbox:thread:updated` — emitted to `clinic:<id>` when a thread is assigned, re-prioritised or closed. */
export interface InboxThreadUpdatedPayload {
  threadId: string;
  status: string;
  priority: string;
  assignee: { id: string; fullName: string | null } | null;
  closedAt: string | null;
  updatedBy: string;
}

/** `inbox:unread:changed` — emitted to `clinic:<id>` when a thread is read or replied to. */
export interface InboxUnreadChangedPayload {
  threadId: string;
  readBy: string;
}

/** `telehealth:chat` — emitted to every other participant's `user:<id>` room. */
export interface TelehealthChatPayload {
  sessionId: string;
  messageId: string;
  senderName: string;
  message: string;
  sentAt: string;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/** `provider-scheduling:availability-updated` — emitted to `clinic:<id>`. */
export interface ProviderAvailabilityUpdatedPayload {
  providerId: string;
  /** Set by single-provider availability upserts. */
  at?: string;
  /** `'time_off_approved'` when triggered by an approved time-off request. */
  reason?: 'time_off_approved';
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/** `payment:confirmed` — emitted to `clinic:<id>` through the transactional outbox. */
export interface PaymentConfirmedPayload {
  paymentId: string;
  txHash: string;
  amount: string;
  assetCode: string;
}

/** `payment:claimable_expiring` — emitted to the patient's `user:<id>` room. */
export interface PaymentClaimableExpiringPayload {
  claimableBalanceId: string;
  amount: string;
  claimableUntil: string;
}

/** `balance:low_warning` | `balance:critical` — emitted to `clinic:<id>` by the balance monitor. */
export interface BalanceAlertPayload {
  type: 'balance_low_warning' | 'balance_critical';
  xlmBalance: string;
  threshold: number;
  clinicId: string;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export type PresenceStatus = 'online' | 'idle' | 'away' | 'offline';

export interface PresenceUser {
  userId: string;
  userName: string;
  status: PresenceStatus;
  lastSeen: string;
  currentResource?: { type: string; id: string };
}

/** `presence:user-online` — emitted to `clinic:<id>` on connect. */
export interface PresenceUserOnlinePayload {
  userId: string;
  userName: string;
  timestamp: string;
}

/** `presence:user-offline` — emitted to `clinic:<id>` on disconnect. */
export interface PresenceUserOfflinePayload {
  userId: string;
  timestamp: string;
}

/** `presence:status-changed` — emitted to `clinic:<id>`. */
export interface PresenceStatusChangedPayload {
  userId: string;
  status: PresenceStatus;
  timestamp: string;
}

/** `presence:activity` — emitted to `clinic:<id>`. */
export interface PresenceActivityPayload {
  userId: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
}

/** `presence:list` — sent to the requesting socket only. */
export interface PresenceListPayload {
  users: PresenceUser[];
}

/** `presence:updated` — emitted to `clinic:<id>` by `PresenceHandler.broadcastPresence()`. */
export interface PresenceUpdatedPayload {
  users: PresenceUser[];
  timestamp: string;
}

// ─── Collaboration ────────────────────────────────────────────────────────────

export interface CollaboratorSummary {
  userId: string;
  userName: string;
  color: string;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  start: number;
  end: number;
}

export interface EditOperation {
  id: string;
  userId: string;
  resourceId: string;
  type: 'insert' | 'delete' | 'replace';
  position: number;
  content?: string;
  length?: number;
  /** Server-assigned. */
  timestamp: string;
  /** Server-assigned, per resource. */
  version: number;
}

/** `collaboration:user-joined` — emitted to `clinic:<id>`. */
export interface CollaborationUserJoinedPayload {
  userId: string;
  userName: string;
  resourceId: string;
  resourceType: string;
  color: string;
  activeUsers: CollaboratorSummary[];
}

/** `collaboration:user-left` — emitted to `clinic:<id>`. */
export interface CollaborationUserLeftPayload {
  userId: string;
  resourceId: string;
  resourceType: string;
  activeUsers: CollaboratorSummary[];
}

/** `collaboration:cursor-update` — emitted to `clinic:<id>`. */
export interface CollaborationCursorUpdatePayload {
  userId: string;
  resourceId: string;
  resourceType: string;
  cursorPosition: CursorPosition;
  selectionRange?: SelectionRange;
}

/** `collaboration:edit-operation` — emitted to `clinic:<id>`. */
export interface CollaborationEditOperationPayload {
  resourceId: string;
  resourceType: string;
  operation: EditOperation;
}

/** `collaboration:sync` — sent to the requesting socket only. */
export interface CollaborationSyncPayload {
  resourceId: string;
  resourceType: string;
  operations: EditOperation[];
  version: number;
  presence: Array<CollaboratorSummary & { cursorPosition?: CursorPosition }>;
}

// ─── Data sync (Issue #1254) ──────────────────────────────────────────────────

/** A single change to a synchronised resource. */
export interface SyncChange {
  /** Globally unique id for this change (client-generated UUID, used for idempotency). */
  changeId: string;
  /** Logical collection / resource type, e.g. "appointment". */
  resource: string;
  /** Id of the specific record that changed. */
  recordId: string;
  /** Operation kind. */
  op: 'create' | 'update' | 'delete';
  /** Full or partial record payload (omitted for deletes). */
  data?: Record<string, unknown>;
  /**
   * Monotonic per-record version the client believes it is updating from.
   * Used for optimistic-concurrency conflict detection.
   */
  baseVersion: number;
  /** Wall-clock time the change was made on the origin client (epoch ms). */
  originTs: number;
  /** User that authored the change. */
  userId: string;
  /** Clinic the record belongs to (sync is always scoped per clinic). */
  clinicId: string;
}

/** A change after the server has accepted and sequenced it. */
export interface SequencedChange extends SyncChange {
  /** Server-assigned, per-clinic strictly increasing sequence number (the sync cursor). */
  seq: number;
  /** New per-record version after applying this change. */
  version: number;
  /** Server receive time (epoch ms). */
  serverTs: number;
}

export type ConflictResolution = 'applied' | 'merged' | 'rejected';

export interface ApplyResult {
  resolution: ConflictResolution;
  /** The sequenced change actually committed (present unless rejected). */
  change?: SequencedChange;
  /** The winning change when a conflict was resolved against another writer. */
  winner?: 'incoming' | 'existing';
  reason?: string;
}

/** Payload a reconnecting client sends to catch up. */
export interface ReconcileRequest {
  clinicId: string;
  /** Last server sequence number the client successfully processed. */
  sinceSeq: number;
  /** Optional resource filter. */
  resources?: string[];
}

export interface ReconcileResponse {
  changes: SequencedChange[];
  /** Latest sequence number available; client should treat this as its new cursor. */
  currentSeq: number;
  /** True when the client's cursor was too old and a full resync is required. */
  resyncRequired: boolean;
}

/** Per-change acknowledgement returned through the `sync:push` ack callback. */
export interface SyncPushAck {
  changeId: string;
  resolution: ConflictResolution;
  seq?: number;
  version?: number;
  reason?: string;
}

// ─── Event maps ───────────────────────────────────────────────────────────────

/**
 * Every event the server emits, keyed by event name. Usable as the first type
 * parameter of socket.io-client's `Socket<ServerToClientEvents, ClientToServerEvents>`.
 */
export interface ServerToClientEvents {
  'notification:new': (payload: NotificationNewPayload) => void;

  'appointment:reminder': (payload: AppointmentReminderPayload) => void;
  'appointment:confirmed': (payload: AppointmentStatusPayload) => void;
  'appointment:cancelled': (payload: AppointmentStatusPayload) => void;
  'appointment:rescheduled': (payload: AppointmentStatusPayload) => void;
  'appointment:patient_arrived': (payload: AppointmentStatusPayload) => void;
  'appointment:checked_in': (payload: AppointmentCheckedInPayload) => void;
  'appointment:video_started': (payload: AppointmentVideoStartedPayload) => void;
  'appointment:video_ended': (payload: AppointmentVideoEndedPayload) => void;

  'encounter:created': (payload: EncounterCreatedPayload) => void;
  'encounter:updated': (payload: EncounterUpdatedPayload) => void;
  'cosignature:requested': (payload: CosignatureRequestedPayload) => void;
  'cosignature:completed': (payload: CosignatureCompletedPayload) => void;
  'cosignature:rejected': (payload: CosignatureRejectedPayload) => void;
  'prescription:allergy_warning': (payload: PrescriptionAllergyWarningPayload) => void;

  'patient:created': (payload: PatientCreatedPayload) => void;
  'lab:critical': (payload: LabCriticalPayload) => void;
  'lab:resulted': (payload: LabResultedPayload) => void;
  'document:uploaded': (payload: DocumentUploadedPayload) => void;

  'portal:message:new': (payload: PortalMessageNewPayload) => void;
  'inbox:thread:updated': (payload: InboxThreadUpdatedPayload) => void;
  'inbox:unread:changed': (payload: InboxUnreadChangedPayload) => void;
  'telehealth:chat': (payload: TelehealthChatPayload) => void;

  'provider-scheduling:availability-updated': (payload: ProviderAvailabilityUpdatedPayload) => void;

  'payment:confirmed': (payload: PaymentConfirmedPayload) => void;
  'payment:claimable_expiring': (payload: PaymentClaimableExpiringPayload) => void;
  'balance:low_warning': (payload: BalanceAlertPayload) => void;
  'balance:critical': (payload: BalanceAlertPayload) => void;

  'presence:user-online': (payload: PresenceUserOnlinePayload) => void;
  'presence:user-offline': (payload: PresenceUserOfflinePayload) => void;
  'presence:status-changed': (payload: PresenceStatusChangedPayload) => void;
  'presence:activity': (payload: PresenceActivityPayload) => void;
  'presence:list': (payload: PresenceListPayload) => void;
  'presence:updated': (payload: PresenceUpdatedPayload) => void;

  'collaboration:user-joined': (payload: CollaborationUserJoinedPayload) => void;
  'collaboration:user-left': (payload: CollaborationUserLeftPayload) => void;
  'collaboration:cursor-update': (payload: CollaborationCursorUpdatePayload) => void;
  'collaboration:edit-operation': (payload: CollaborationEditOperationPayload) => void;
  'collaboration:sync': (payload: CollaborationSyncPayload) => void;
}

/** Every event the server listens for, keyed by event name. */
export interface ClientToServerEvents {
  join_appointment: (appointmentId: string) => void;
  leave_appointment: (appointmentId: string) => void;

  'presence:status-change': (data: { status: PresenceStatus }) => void;
  'presence:activity': (data: { resourceType: string; resourceId: string }) => void;
  'presence:request-list': () => void;

  'collaboration:start-editing': (data: {
    resourceId: string;
    resourceType: string;
    color: string;
  }) => void;
  'collaboration:stop-editing': (data: { resourceId: string; resourceType: string }) => void;
  'collaboration:cursor-move': (data: {
    resourceId: string;
    resourceType: string;
    cursorPosition: CursorPosition;
    selectionRange?: SelectionRange;
  }) => void;
  'collaboration:edit-operation': (data: {
    resourceId: string;
    resourceType: string;
    operation: Omit<EditOperation, 'timestamp' | 'version'>;
  }) => void;
  'collaboration:request-sync': (data: { resourceId: string; resourceType: string }) => void;
}

export type ServerToClientEventName = keyof ServerToClientEvents;
export type ClientToServerEventName = keyof ClientToServerEvents;
