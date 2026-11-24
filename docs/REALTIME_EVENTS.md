# Real-time Events (Socket.IO) Contract

Every Socket.IO event the API emits or listens for: name, direction, room,
payload type and trigger.

**Last Updated:** 2026-10-17

Payload types are defined once in [`packages/types/src/realtime.ts`](../packages/types/src/realtime.ts)
and exported from `@health-watchers/types`, so client code and these docs share the same definitions:

```ts
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@health-watchers/types';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  auth: { token: accessToken },
  transports: ['websocket', 'polling'],
});

socket.on('lab:critical', (p) => showAlert(p.testName, p.reason)); // p: LabCriticalPayload
```

---

## Contents

- [Connection and authentication](#connection-and-authentication)
- [Rooms](#rooms)
- [Reconnection behaviour](#reconnection-behaviour)
- [Server → client events](#server--client-events)
- [Client → server events](#client--server-events)
- [Defined but not wired](#defined-but-not-wired)
- [Known limitations](#known-limitations)
- [Adding a new event](#adding-a-new-event)

---

## Connection and authentication

The API attaches Socket.IO to its HTTP server on the default path `/socket.io`.
Allowed transports are `websocket` and `polling`.

Two Socket.IO servers are attached to the same HTTP server in `apps/api/src/app.ts`.
Both read the token from the same places:

| Server                                       | Created by                    | Token check                                                                                     | Handlers registered                                         |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `realtime/socket.ts`                         | `initSocket(server)`          | `verifyAccessToken()` against `JWT_ACCESS_TOKEN_SECRET`, checks expiry (15 min access tokens) | presence, collaboration                                     |
| `services/socket.service.ts` (`SocketService`) | `SocketService.getInstance(server)` | `jwt.verify(token, JWT_SECRET, HS256)`, then loads the user from MongoDB                  | `join_appointment`, `leave_appointment`                     |

**Handshake.** Send the access token in one of these:

1. `auth.token` in the handshake (preferred): `io(url, { auth: { token } })`
2. An `Authorization: Bearer <token>` header (Node clients and React Native only; browsers cannot set headers on WebSocket)

**Failures** reach the client as a `connect_error` whose `message` is one of:

| Message                                    | Server          | Cause                                                   |
| ------------------------------------------ | --------------- | ------------------------------------------------------- |
| `Authentication required`                  | `socket.ts`     | No token                                                |
| `Invalid or expired token`                 | `socket.ts`     | Bad signature or expired token                          |
| `Authentication token required`            | `SocketService` | No token                                                |
| `User not found`                           | `SocketService` | Token valid but the user no longer exists               |
| `Authentication failed`                    | `SocketService` | Token failed verification                               |
| `Socket.IO CORS: origin '<o>' not allowed` | `socket.ts`     | Browser origin not in `WEB_URL` (comma-separated list)  |

`SocketService` takes its CORS origins from `ALLOWED_ORIGINS` (default `http://localhost:3000`).

## Rooms

| Room                    | Joined                                                                    | Scope                                       |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `clinic:<clinicId>`     | Automatically on connect (`clinicId` from the token / user record)        | Everyone in the clinic                      |
| `user:<userId>`         | Automatically on connect                                                  | All of one user's sockets (tabs, devices)   |
| `appointment:<id>`      | Client emits `join_appointment` (leave with `leave_appointment`)          | Sockets viewing one appointment             |

The client can't choose its clinic or user room; both come from the verified token.

## Reconnection behaviour

**Client side.** socket.io-client reconnects automatically with exponential backoff
(library defaults: 1 s initial delay, 5 s max, unlimited attempts). The web client
(`apps/web/src/lib/socket.ts`) uses those defaults.

- **Refresh the token before reconnecting.** The handshake reuses `socket.auth`.
  Access tokens last 15 minutes, so a socket that drops after that fails with
  `Invalid or expired token`. Update the token and reconnect:

  ```ts
  socket.on('connect_error', async (err) => {
    if (err.message === 'Invalid or expired token' || err.message === 'Authentication failed') {
      socket.auth = { token: await refreshAccessToken() };
      socket.connect();
    }
  });
  ```

- **Events are not replayed.** Anything emitted while a client was disconnected is
  lost. Re-fetch the relevant REST resources on `connect`, as `apps/web/src/hooks/useInbox.ts` does.
- **Re-join appointment rooms.** `appointment:<id>` membership doesn't survive a
  reconnect; emit `join_appointment` again in the `connect` handler.

**Server side, on every new connection:**

- the socket joins `clinic:<id>` and `user:<id>` again
- `presence:user-online` is broadcast to the clinic

**On disconnect:**

- `presence:user-offline` is broadcast and the user is marked offline. The presence
  entry is removed after 30 s unless the user reconnects first.
- the user is removed from every collaboration session (`collaboration:user-left`)

---

## Server → client events

"Via" names the emitter: `socket.ts` is `emitToUser` / `emitToClinic` from
`realtime/socket.ts`, `SocketService` is `services/socket.service.ts`, and **outbox**
means the event is written to the transactional outbox in the same transaction as
the data change and delivered by the outbox relay (#1432), at least once.

`SocketService` adds a `timestamp` (ISO string) to every payload it emits.

### Notifications

| Event              | Room           | Payload type             | Trigger                                                                                     | Via        |
| ------------------ | -------------- | ------------------------ | ------------------------------------------------------------------------------------------- | ---------- |
| `notification:new` | `user:<id>`    | `NotificationNewPayload` | Any in-app notification created via `createNotification()`, or delivered by the [notification-dispatch](./BACKGROUND_JOBS.md#notification-dispatch) worker | `socket.ts` |

### Appointments

| Event                         | Room                                   | Payload type                     | Trigger                                                                                         | Via                    |
| ----------------------------- | -------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| `appointment:confirmed`       | `appointment:<id>`, `clinic:<id>`      | `AppointmentStatusPayload`       | Appointment status set to `confirmed`                                                          | outbox → `SocketService` |
| `appointment:cancelled`       | `appointment:<id>`, `clinic:<id>`      | `AppointmentStatusPayload`       | Appointment cancelled (includes `cancelledBy`, `cancellationReason`)                           | outbox → `SocketService` |
| `appointment:rescheduled`     | `appointment:<id>`, `clinic:<id>`      | `AppointmentStatusPayload`       | `scheduledAt` changed (includes `oldScheduledAt`, `newScheduledAt`)                             | outbox → `SocketService` |
| `appointment:patient_arrived` | `appointment:<id>`, `clinic:<id>`      | `AppointmentStatusPayload`       | Patient checked in by staff (includes `checkedInAt`)                                           | outbox → `SocketService` |
| `appointment:checked_in`      | `clinic:<id>`                          | `AppointmentCheckedInPayload`    | Patient self check-in (QR/kiosk)                                                               | `SocketService`        |
| `appointment:reminder`        | `user:<doctorId>`, `user:<patientId>`  | `AppointmentReminderPayload`     | [appointment-reminder](./BACKGROUND_JOBS.md#appointment-reminder) job, 24 h and 1 h before       | `socket.ts`            |
| `appointment:video_started`   | `user:<doctorId>`, `user:<patientId>`  | `AppointmentVideoStartedPayload` | Telemedicine session started                                                                    | `socket.ts`            |
| `appointment:video_ended`     | `user:<doctorId>`, `user:<patientId>`  | `AppointmentVideoEndedPayload`   | Telemedicine session ended (`videoDuration` in minutes)                                        | `socket.ts`            |

The v2 appointment routes (`routes/v2/appointments.routes.ts`) emit the same four
status events directly through `SocketService`, with the same payload shape.

### Encounters and clinical

| Event                          | Room                     | Payload type                         | Trigger                                                  | Via                |
| ------------------------------ | ------------------------ | ------------------------------------ | -------------------------------------------------------- | ------------------ |
| `encounter:created`            | `clinic:<id>`            | `EncounterCreatedPayload`            | Encounter created                                        | outbox → `socket.ts` |
| `encounter:updated`            | `clinic:<id>`            | `EncounterUpdatedPayload`            | Encounter updated                                        | outbox → `socket.ts` |
| `cosignature:requested`        | `user:<targetDoctorId>`  | `CosignatureRequestedPayload`        | Co-signature requested                                   | `socket.ts`        |
| `cosignature:completed`        | `user:<requesterId>`     | `CosignatureCompletedPayload`        | Co-signature approved                                    | `socket.ts`        |
| `cosignature:rejected`         | `user:<requesterId>`     | `CosignatureRejectedPayload`         | Co-signature rejected                                    | `socket.ts`        |
| `prescription:allergy_warning` | `clinic:<id>`            | `PrescriptionAllergyWarningPayload`  | Prescription added with an allergy override             | `socket.ts`        |
| `patient:created`              | `clinic:<id>`            | `PatientCreatedPayload`              | Patient registered                                       | `socket.ts`        |
| `lab:critical`                 | `user:<orderedBy>`, `clinic:<id>` | `LabCriticalPayload`        | Lab result recorded with a critical value               | `socket.ts`        |
| `lab:resulted`                 | `clinic:<id>`            | `LabResultedPayload`                 | Lab result recorded (non-critical)                       | `socket.ts`        |
| `document:uploaded`            | `clinic:<id>`            | `DocumentUploadedPayload`            | Patient uploads a document through the portal            | `socket.ts`        |

### Messaging and scheduling

| Event                                      | Room                                   | Payload type                         | Trigger                                                                               | Via         |
| ------------------------------------------ | -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | ----------- |
| `portal:message:new`                       | `clinic:<id>`, and `user:<patientUserId>` for staff replies | `PortalMessageNewPayload` | Patient sends a portal message, or staff reply from the patient chart or the inbox   | `socket.ts` |
| `inbox:thread:updated`                     | `clinic:<id>`                          | `InboxThreadUpdatedPayload`          | Thread assigned, re-prioritised or status changed                                    | `socket.ts` |
| `inbox:unread:changed`                     | `clinic:<id>`                          | `InboxUnreadChangedPayload`          | Thread marked read, or a staff reply sent                                            | `socket.ts` |
| `telehealth:chat`                          | `user:<participantId>` (everyone except sender) | `TelehealthChatPayload`     | Chat message in a telehealth session                                                 | `socket.ts` |
| `provider-scheduling:availability-updated` | `clinic:<id>`                          | `ProviderAvailabilityUpdatedPayload` | Availability upserted, template applied, or time-off approved (`reason: 'time_off_approved'`) | `socket.ts` |

### Payments

| Event                        | Room                   | Payload type                       | Trigger                                                                                                  | Via                |
| ---------------------------- | ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| `payment:confirmed`          | `clinic:<id>`          | `PaymentConfirmedPayload`          | Payment confirmed on Stellar (`confirmPayment()`)                                                        | outbox → `socket.ts` |
| `payment:claimable_expiring` | `user:<patientId>`     | `PaymentClaimableExpiringPayload`  | [claimable-expiry-notification](./BACKGROUND_JOBS.md#claimable-expiry-notification) job                  | `socket.ts`        |
| `balance:low_warning`        | `clinic:<id>`          | `BalanceAlertPayload`              | [balance-monitoring](./BACKGROUND_JOBS.md#balance-monitoring) job: balance below the warning threshold    | `socket.ts`        |
| `balance:critical`           | `clinic:<id>`          | `BalanceAlertPayload`              | [balance-monitoring](./BACKGROUND_JOBS.md#balance-monitoring) job: balance below the critical threshold   | `socket.ts`        |

### Presence (`realtime/presence.handler.ts`)

| Event                     | Room                 | Payload type                    | Trigger                                    |
| ------------------------- | -------------------- | ------------------------------- | ------------------------------------------ |
| `presence:user-online`    | `clinic:<id>`        | `PresenceUserOnlinePayload`     | Socket connected                           |
| `presence:user-offline`   | `clinic:<id>`        | `PresenceUserOfflinePayload`    | Socket disconnected                        |
| `presence:status-changed` | `clinic:<id>`        | `PresenceStatusChangedPayload`  | Client emitted `presence:status-change`    |
| `presence:activity`       | `clinic:<id>`        | `PresenceActivityPayload`       | Client emitted `presence:activity`         |
| `presence:list`           | requesting socket    | `PresenceListPayload`           | Client emitted `presence:request-list`     |
| `presence:updated`        | `clinic:<id>`        | `PresenceUpdatedPayload`        | `PresenceHandler.broadcastPresence()` (no caller yet) |

### Collaboration (`realtime/collaboration.handler.ts`)

| Event                          | Room              | Payload type                         | Trigger                                                    |
| ------------------------------ | ----------------- | ------------------------------------ | ---------------------------------------------------------- |
| `collaboration:user-joined`    | `clinic:<id>`     | `CollaborationUserJoinedPayload`     | Client emitted `collaboration:start-editing`               |
| `collaboration:user-left`      | `clinic:<id>`     | `CollaborationUserLeftPayload`       | Client emitted `collaboration:stop-editing`, or disconnected |
| `collaboration:cursor-update`  | `clinic:<id>`     | `CollaborationCursorUpdatePayload`   | Client emitted `collaboration:cursor-move`                 |
| `collaboration:edit-operation` | `clinic:<id>`     | `CollaborationEditOperationPayload`  | Client emitted `collaboration:edit-operation` (server sets `version` and `timestamp`, and writes an audit log) |
| `collaboration:sync`           | requesting socket | `CollaborationSyncPayload`           | Client emitted `collaboration:request-sync`                |

Collaboration and presence events go to the **whole clinic room**, not only to
users editing the same resource. Filter on `resourceType` / `resourceId` on the client.

---

## Client → server events

| Event                          | Payload                                                                   | Server          | Effect                                          |
| ------------------------------ | ------------------------------------------------------------------------- | --------------- | ----------------------------------------------- |
| `join_appointment`             | `appointmentId: string`                                                   | `SocketService` | Join `appointment:<id>`                         |
| `leave_appointment`            | `appointmentId: string`                                                   | `SocketService` | Leave `appointment:<id>`                        |
| `presence:status-change`       | `{ status: 'online' \| 'idle' \| 'away' \| 'offline' }`                   | `socket.ts`     | Broadcast `presence:status-changed`             |
| `presence:activity`            | `{ resourceType, resourceId }`                                            | `socket.ts`     | Broadcast `presence:activity`                   |
| `presence:request-list`        | none                                                                      | `socket.ts`     | Reply with `presence:list`                      |
| `collaboration:start-editing`  | `{ resourceId, resourceType, color }`                                     | `socket.ts`     | Broadcast `collaboration:user-joined`           |
| `collaboration:stop-editing`   | `{ resourceId, resourceType }`                                            | `socket.ts`     | Broadcast `collaboration:user-left`             |
| `collaboration:cursor-move`    | `{ resourceId, resourceType, cursorPosition, selectionRange? }`           | `socket.ts`     | Broadcast `collaboration:cursor-update`         |
| `collaboration:edit-operation` | `{ resourceId, resourceType, operation }`                                 | `socket.ts`     | Broadcast `collaboration:edit-operation`        |
| `collaboration:request-sync`   | `{ resourceId, resourceType }`                                            | `socket.ts`     | Reply with `collaboration:sync`                 |

Typed as `ClientToServerEvents` in `@health-watchers/types`.

---

## Defined but not wired

The following are implemented but **never reach clients today**. Don't build features on them until they are wired up.

| Source                                | Events                                                                                                                         | Why not live                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `realtime/sync.handler.ts` (#1254)    | client→server `sync:subscribe`, `sync:push` (with ack), `sync:reconcile`; server→client `sync:subscribed`, `sync:batch`, `sync:delta`, `sync:resync-required` | `SyncHandler.registerHandlers` is imported in `socket.ts` but never called |
| `realtime/notification.handler.ts`    | `notification:data-change`, `notification:appointment-update`, `notification:alert`, `notification:appointment-reminder`, `notification:critical-result`, `notification:marked-read`, `notification:cleared` | `NotificationHandler` has no callers                               |
| `realtime/activity-feed.handler.ts`   | `activity:new-entry`, `activity:subscribed`, `activity:unsubscribed`                                                           | `ActivityFeedHandler` has no callers                               |

The data-sync types (`SyncChange`, `SequencedChange`, `ReconcileRequest`,
`ReconcileResponse`, `SyncPushAck`) are already in `@health-watchers/types`, ready
for when the handler is registered.

---

## Known limitations

- **Two Socket.IO servers on one HTTP server.** `SocketService` and `initSocket` both
  attach at `/socket.io`. A client connection ends up on one of them, and events
  emitted by the other server (for example the `SocketService` appointment events
  and `join_appointment` rooms) are not guaranteed to reach it. Test both
  paths end to end when changing either server.
- **Different signing secrets.** `SocketService` verifies with `JWT_SECRET` and
  `socket.ts` with `JWT_ACCESS_TOKEN_SECRET`. If the two differ, access tokens are
  rejected by `SocketService` with `Authentication failed`.
- **No cross-replica fan-out.** There is no Socket.IO Redis adapter, so an emit only
  reaches sockets connected to the same API replica. With more than one replica, use
  sticky sessions and expect clients on other replicas to miss events; they should
  re-fetch on reconnect.
- **In-memory presence and collaboration state.** Each replica keeps its own state
  in memory, and it is lost on restart.
- **Worker processes can't emit.** Jobs running on a worker without a Socket.IO server
  drop their emits (see [outbox-relay](./BACKGROUND_JOBS.md#outbox-relay)).

---

## Adding a new event

1. Add the payload interface and an entry in `ServerToClientEvents` (or
   `ClientToServerEvents`) in `packages/types/src/realtime.ts`.
2. Emit with `emitToUser` / `emitToClinic` from `realtime/socket.ts`. For events
   tied to a data change, add a `{ kind: 'socket', ... }` target to the outbox
   event so the emit commits with the data.
3. Add a row to the matching table in this file.
