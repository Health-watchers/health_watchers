# Webhook Consumer Guide

How to receive Health Watchers webhooks: subscribing, event payloads, verifying
signatures, retries, and testing your endpoint.

**Last Updated:** 2026-10-17

---

## Contents

- [Quick start](#quick-start)
- [Managing subscriptions](#managing-subscriptions)
- [Request format](#request-format)
- [Event catalogue](#event-catalogue)
- [Verifying signatures](#verifying-signatures)
  - [Node.js](#nodejs)
  - [Python](#python)
  - [PHP](#php)
- [Retries, backoff and delivery states](#retries-backoff-and-delivery-states)
- [Idempotency](#idempotency)
- [Test your endpoint](#test-your-endpoint)
- [Troubleshooting](#troubleshooting)

---

## Quick start

1. Expose an HTTPS endpoint that accepts `POST` with a JSON body.
2. Register it (requires a `CLINIC_ADMIN` or `SUPER_ADMIN` token):

   ```bash
   curl -X POST https://api.example.com/api/v1/webhooks \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://your-service.example.com/hooks/health-watchers",
       "events": ["payment.confirmed", "appointment.created", "appointment.cancelled"],
       "description": "Billing integration"
     }'
   ```

3. **Store `data.secret` from the response.** It is shown once and never returned again.
4. [Verify the signature](#verifying-signatures) on every request, respond `2xx`
   within 10 seconds, and do the actual work asynchronously.
5. [Send a test event](#test-your-endpoint).

## Managing subscriptions

All routes are under `/api/v1/webhooks`, need a bearer token with
`CLINIC_ADMIN` or `SUPER_ADMIN`, and are scoped to the caller's clinic.

| Method   | Path                                     | Purpose                                                                      |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `POST`   | `/`                                      | Register a webhook. Returns the signing `secret` once                       |
| `GET`    | `/`                                      | List webhooks (secrets excluded)                                            |
| `GET`    | `/events`                                | List subscribable event types                                               |
| `GET`    | `/:id`                                   | Get one webhook                                                             |
| `PATCH`  | `/:id`                                   | Update `url`, `events`, `isActive`, `description`, `retryConfig`, `payloadTemplate`, `rateLimitPerMin` |
| `DELETE` | `/:id`                                   | Delete a webhook                                                            |
| `GET`    | `/:id/deliveries`                        | Delivery history                                                            |
| `GET`    | `/:id/deliveries/:deliveryId`            | Full delivery detail: request headers, response status/body, error, timing |
| `POST`   | `/:id/deliveries/:deliveryId/retry`      | Retry a delivery that was not delivered                                     |
| `POST`   | `/:id/test`                              | Send a `webhook.test` event                                                 |
| `GET`    | `/:id/events`                            | Event log for the webhook                                                   |
| `GET`    | `/stats/overview`                        | Counts of webhooks and deliveries by status                                 |

**Registration options**

| Field             | Type     | Default                                 | Notes                                                                                     |
| ----------------- | -------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `url`             | string   | required                                | Must pass SSRF validation: no private/loopback hosts, and HTTPS when the API runs in production |
| `events`          | string[] | required                                | At least one value from [the catalogue](#event-catalogue)                                 |
| `description`     | string   |                                         | Max 255 characters                                                                        |
| `retryConfig`     | object   | `{ maxRetries: 3, backoffType: 'exponential', initialDelayMs: 1000 }` | `maxRetries` 1–10, `backoffType` `exponential` / `linear` / `fixed`, `initialDelayMs` 100–60000 |
| `payloadTemplate` | object   | none                                    | Reshape the body; see [Payload templates](#payload-templates)                            |
| `rateLimitPerMin` | integer  | `0` (off)                               | Max deliveries per rolling minute. Extra deliveries are recorded as `dead`, not queued   |

## Request format

Every delivery is an HTTP `POST` with a JSON body and these headers:

| Header                    | Example                                                  | Meaning                                                                                       |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Content-Type`            | `application/json`                                       |                                                                                               |
| `User-Agent`              | `HealthWatchers-Webhooks/1`                              |                                                                                               |
| `X-Webhook-Event`         | `payment.confirmed`                                      | Event type                                                                                    |
| `X-Webhook-Id`            | `6650c1e4f1a2b3c4d5e6f701`                               | Delivery id. The same on every retry of this delivery                                        |
| `X-Webhook-Event-Id`      | `0d9c5f0e-1b7a-4e0b-9a51-1c2b3d4e5f60`                   | Business event id, present for events published through the outbox. Use it for de-duplication |
| `X-Webhook-Attempt`       | `1`                                                      | 1-based attempt number                                                                        |
| `X-Webhook-Timestamp`     | `1792224000`                                             | Unix seconds at signing time                                                                  |
| `X-Webhook-Signature-256` | `t=1792224000,v1=5f2b…`                                  | **Current scheme.** Verify this one                                                           |
| `X-Webhook-Signature`     | `a3c1…` (64 hex chars)                                   | Legacy: HMAC of the body only, no replay protection. Kept for older receivers               |

**Body envelope** (when no `payloadTemplate` is set):

```json
{
  "eventId": "0d9c5f0e-1b7a-4e0b-9a51-1c2b3d4e5f60",
  "event": "payment.confirmed",
  "data": { "...": "event-specific, see below" },
  "timestamp": "2026-10-17T09:30:12.481Z"
}
```

| Field       | Present                                  | Notes                                                       |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- |
| `eventId`   | Outbox events (all business events today) | Same value as `X-Webhook-Event-Id`, also copied into `data` |
| `event`     | Always                                   | Same as `X-Webhook-Event`                                   |
| `data`      | Always                                   | Event payload                                               |
| `metadata`  | When the dispatcher passes metadata      | Free-form                                                   |
| `timestamp` | Always                                   | When the event was dispatched (ISO-8601, UTC)               |

### Payload templates

A webhook can set `payloadTemplate`, a JSON object whose string values may contain
`{{ path }}` placeholders resolved against `{ event, data, timestamp, webhookId, metadata }`.
A string that is only one placeholder keeps the resolved value's type; unknown
paths render as `""`. Example:

```json
{ "type": "{{ event }}", "amount": "{{ data.amount }}", "ref": "HW-{{ data.intentId }}" }
```

Templated bodies are signed exactly like the default envelope. The envelope's
`eventId` is not added automatically when a template is used; include
`{{ data.eventId }}` if you need it, or use the `X-Webhook-Event-Id` header.

## Event catalogue

`GET /api/v1/webhooks/events` returns the subscribable list. Events marked
**reserved** can be subscribed to, but nothing in the API emits them yet.

| Event                   | Status       | Fired when                                                        |
| ----------------------- | ------------ | ----------------------------------------------------------------- |
| `payment.confirmed`     | **live**     | A Stellar payment is confirmed (API confirm call or stellar-service stream) |
| `appointment.created`   | **live**     | An appointment is booked                                          |
| `appointment.cancelled` | **live**     | An appointment is cancelled                                       |
| `encounter.created`     | **live**     | An encounter is created                                           |
| `encounter.updated`     | **live**     | An encounter is updated                                           |
| `webhook.test`          | **live**     | You call `POST /webhooks/:id/test` (sent regardless of subscriptions) |
| `payment.failed`        | reserved     |                                                                   |
| `patient.created`       | reserved     |                                                                   |
| `patient.updated`       | reserved     |                                                                   |
| `lab_result.created`    | reserved     |                                                                   |
| `lab_result.updated`    | reserved     |                                                                   |
| `referral.created`      | reserved     |                                                                   |
| `referral.completed`    | reserved     |                                                                   |
| `immunization.recorded` | reserved     |                                                                   |
| `care_plan.created`     | reserved     |                                                                   |
| `care_plan.updated`     | reserved     |                                                                   |
| `consent.granted`       | reserved     |                                                                   |
| `consent.revoked`       | reserved     |                                                                   |
| `notification.created`  | reserved     |                                                                   |
| `invoice.created`       | reserved     |                                                                   |
| `invoice.paid`          | reserved     |                                                                   |

Treat unknown fields as additive: new fields may appear in `data` without notice.

### `payment.confirmed`

```json
{
  "eventId": "0d9c5f0e-1b7a-4e0b-9a51-1c2b3d4e5f60",
  "event": "payment.confirmed",
  "data": {
    "paymentId": "6650c1e4f1a2b3c4d5e6f701",
    "intentId": "4f7b8c1a-2d3e-4f5a-9b6c-7d8e9f0a1b2c",
    "amount": "25.0000000",
    "assetCode": "XLM",
    "destination": "GCLINIC...XYZ",
    "txHash": "b6d7c0f1e2a3...9f",
    "usdEquivalent": "2.75",
    "confirmedAt": "2026-10-17T09:30:12.300Z",
    "eventId": "0d9c5f0e-1b7a-4e0b-9a51-1c2b3d4e5f60"
  },
  "timestamp": "2026-10-17T09:30:12.481Z"
}
```

### `appointment.created`

`data.appointment` is the full appointment record as stored.

```json
{
  "eventId": "8a1f2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
  "event": "appointment.created",
  "data": {
    "appointmentId": "6650c2a9f1a2b3c4d5e6f7a2",
    "status": "scheduled",
    "appointment": {
      "_id": "6650c2a9f1a2b3c4d5e6f7a2",
      "clinicId": "664f00000000000000000001",
      "patientId": "664f000000000000000000aa",
      "doctorId": "664f000000000000000000bb",
      "scheduledAt": "2026-10-20T14:00:00.000Z",
      "duration": 30,
      "status": "scheduled"
    },
    "eventId": "8a1f2b3c-4d5e-6f70-8192-a3b4c5d6e7f8"
  },
  "timestamp": "2026-10-17T09:31:02.019Z"
}
```

### `appointment.cancelled`

```json
{
  "eventId": "c4d5e6f7-0819-2a3b-4c5d-6e7f8091a2b3",
  "event": "appointment.cancelled",
  "data": {
    "appointmentId": "6650c2a9f1a2b3c4d5e6f7a2",
    "status": "cancelled",
    "appointment": { "_id": "6650c2a9f1a2b3c4d5e6f7a2", "status": "cancelled", "...": "..." },
    "cancelledBy": "664f000000000000000000bb",
    "cancellationReason": "Patient requested",
    "eventId": "c4d5e6f7-0819-2a3b-4c5d-6e7f8091a2b3"
  },
  "timestamp": "2026-10-17T10:02:44.730Z"
}
```

### `encounter.created`

```json
{
  "eventId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
  "event": "encounter.created",
  "data": {
    "encounterId": "6650c3b0f1a2b3c4d5e6f7c3",
    "patientId": "664f000000000000000000aa",
    "eventId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b"
  },
  "timestamp": "2026-10-17T11:15:00.102Z"
}
```

### `encounter.updated`

`fields` lists the top-level fields included in the update.

```json
{
  "eventId": "a9b8c7d6-e5f4-4321-9876-543210fedcba",
  "event": "encounter.updated",
  "data": {
    "encounterId": "6650c3b0f1a2b3c4d5e6f7c3",
    "patientId": "664f000000000000000000aa",
    "fields": ["status", "diagnosis"],
    "eventId": "a9b8c7d6-e5f4-4321-9876-543210fedcba"
  },
  "timestamp": "2026-10-17T11:40:27.554Z"
}
```

### `webhook.test`

```json
{
  "event": "webhook.test",
  "data": {
    "message": "This is a test event from Health Watchers.",
    "nonce": "9f86d081884c7d65"
  },
  "timestamp": "2026-10-17T12:00:00.000Z"
}
```

> Webhook payloads can contain PHI (patient ids, appointment details). Your
> endpoint must meet the same handling requirements as any other PHI store;
> see [PHI Handling Guide](./PHI_HANDLING_GUIDE.md).

## Verifying signatures

The current scheme (`X-Webhook-Signature-256`):

```
signed_payload = "<t>" + "." + <raw request body>
signature      = hex( HMAC-SHA256( key = webhook secret, message = signed_payload ) )
header         = "t=<t>,v1=<signature>"
```

To verify:

1. Read the **raw body bytes** before any JSON parsing. Re-serialising parsed JSON changes whitespace and key order and breaks the HMAC.
2. Parse `X-Webhook-Signature-256` into `t` and `v1`. Reject the request if either is missing or `t` is not an integer.
3. Reject when `|now - t| > 300` seconds. This is the replay window the API uses; keep server clocks in sync with NTP.
4. Compute the HMAC over `t + "." + rawBody` and compare it with `v1` in **constant time**.
5. Only then parse the JSON and process it.

Respond `401` when verification fails. The API records the response but does not
treat `401` differently from other failures, so the delivery is retried.

A legacy-only receiver can verify `X-Webhook-Signature` = `hex(HMAC-SHA256(secret, rawBody))`.
That check has no timestamp, so a captured request can be replayed. Move to the `-256` header.

### Node.js

```js
// npm i express
const crypto = require('crypto');
const express = require('express');

const SECRET = process.env.HW_WEBHOOK_SECRET;
const TOLERANCE_SECONDS = 300;

function verify(rawBody, header) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=')));
  if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) return false;

  if (Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t)) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const app = express();

// Keep the raw body: do NOT use express.json() on this route.
app.post('/hooks/health-watchers', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  if (!verify(rawBody, req.get('X-Webhook-Signature-256'))) {
    return res.status(401).send('invalid signature');
  }

  const event = JSON.parse(rawBody);
  res.status(200).end(); // acknowledge first…
  setImmediate(() => handleEvent(event, req.get('X-Webhook-Event-Id') || req.get('X-Webhook-Id')));
});

app.listen(3000);
```

### Python

```python
# pip install flask
import hashlib
import hmac
import os
import time

from flask import Flask, abort, request

SECRET = os.environ["HW_WEBHOOK_SECRET"].encode()
TOLERANCE_SECONDS = 300

app = Flask(__name__)


def verify(raw_body: bytes, header: str | None) -> bool:
    if not header:
        return False
    parts = dict(kv.strip().split("=", 1) for kv in header.split(",") if "=" in kv)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1 or not t.isdigit():
        return False
    if abs(int(time.time()) - int(t)) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(SECRET, t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


@app.post("/hooks/health-watchers")
def receive():
    raw_body = request.get_data()  # raw bytes, before JSON parsing
    if not verify(raw_body, request.headers.get("X-Webhook-Signature-256")):
        abort(401)

    event = request.get_json()
    dedupe_key = request.headers.get("X-Webhook-Event-Id") or request.headers.get("X-Webhook-Id")
    enqueue(event, dedupe_key)  # process asynchronously
    return "", 200
```

### PHP

```php
<?php
// Plain PHP 8 — works behind any framework that gives access to the raw body.

const TOLERANCE_SECONDS = 300;

function hw_verify(string $rawBody, ?string $header, string $secret): bool
{
    if (!$header) {
        return false;
    }
    $parts = [];
    foreach (explode(',', $header) as $kv) {
        [$k, $v] = array_pad(explode('=', trim($kv), 2), 2, null);
        $parts[$k] = $v;
    }
    $t = $parts['t'] ?? null;
    $v1 = $parts['v1'] ?? null;
    if (!$t || !$v1 || !ctype_digit($t)) {
        return false;
    }
    if (abs(time() - (int) $t) > TOLERANCE_SECONDS) {
        return false;
    }
    $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
    return hash_equals($expected, $v1);
}

$rawBody = file_get_contents('php://input');
$header = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE_256'] ?? null;

if (!hw_verify($rawBody, $header, getenv('HW_WEBHOOK_SECRET'))) {
    http_response_code(401);
    exit('invalid signature');
}

$event = json_decode($rawBody, true);
$dedupeKey = $_SERVER['HTTP_X_WEBHOOK_EVENT_ID'] ?? $_SERVER['HTTP_X_WEBHOOK_ID'] ?? null;
enqueue_event($event, $dedupeKey); // process asynchronously
http_response_code(200);
```

## Retries, backoff and delivery states

**Success** means an HTTP `2xx` within **10 seconds**. Any other status, a timeout or a
connection error counts as a failed attempt.

**Attempts.** A delivery gets at most `retryConfig.maxRetries` attempts in total,
first attempt included (default 3). The delay before attempt *n + 1* (*n* = 0 for the
first retry) depends on `backoffType`:

| `backoffType`           | Delay                        | Default config (1000 ms)  |
| ----------------------- | ---------------------------- | ------------------------- |
| `exponential` (default) | `initialDelayMs × 2^n`       | 1 s, 2 s, 4 s, …          |
| `linear`                | `initialDelayMs × (n + 1)`   | 1 s, 2 s, 3 s, …          |
| `fixed`                 | `initialDelayMs`             | 1 s, 1 s, 1 s, …          |

The computed delay is stored as the delivery's `nextRetryAt`. The `webhook-retry`
worker scans every 30 s for `pending` deliveries whose `nextRetryAt` has passed (see
[Background Jobs](./BACKGROUND_JOBS.md#webhook-retry)), so in practice a retry
waits at least until the next scan.

> The first delivery's in-process attempts currently run one after another
> without waiting for the backoff; the backoff is applied when the retry worker or a
> manual retry takes over. Don't rely on specific gaps between attempts. Make
> your endpoint fast and idempotent instead.

**Delivery states** (as shown in `GET /webhooks/:id/deliveries`):

| Status      | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `pending`   | Waiting for its first attempt or for a retry (`nextRetryAt`)                                     |
| `delivered` | Your endpoint returned `2xx`                                                                     |
| `failed`    | An attempt failed; it is either retried or moved to `dead`                                       |
| `dead`      | Out of attempts, URL blocked, rate limit exceeded, or the webhook was deleted. Not retried automatically |

Dead deliveries can be re-sent with `POST /webhooks/:id/deliveries/:deliveryId/retry`
or the **Retry** button in Settings → Webhooks.

**Upstream durability.** Business events are written to a transactional outbox in
the same database transaction as the change that caused them (#1432). If the API
crashes before a delivery is queued, the outbox relay re-dispatches it (up to 10
times with 5 s → 10 min backoff), and exactly one delivery record is kept per
`(event, webhook)`. A committed change is not silently lost on its way to your endpoint.

## Idempotency

Deliveries are **at least once**. You may receive the same event more than once,
for example when your endpoint processed a request but timed out before responding.

- De-duplicate on **`X-Webhook-Event-Id`** (also `eventId` in the body). It identifies
  the business event and stays the same across retries and outbox re-dispatch.
- For `webhook.test` (no event id), use `X-Webhook-Id`, which stays the same across
  retries of one delivery.
- Store processed ids with a unique constraint, and record the id in the same
  transaction as your side effect.
- **Ordering is not guaranteed.** An `appointment.cancelled` can arrive before the
  matching `appointment.created` after a retry. Use `timestamp` and the resource's
  own state (e.g. `data.appointment.status`) rather than arrival order.
- Respond `2xx` as soon as the request is verified and persisted, then process it.
  Slow handlers cause timeouts, and timeouts cause duplicates.

## Test your endpoint

### From the web app (WebhookManager)

1. Go to **Settings → Webhooks** and click **Details** on your webhook.
2. Click **Send test event**. The API queues a signed `webhook.test` delivery to
   your URL. Test deliveries skip the webhook's rate limit and are flagged
   `isTest` in the history.
3. The **Deliveries** tab refreshes and shows the `webhook.test` delivery with its
   status and attempt count. A `failed` or `dead` delivery shows the error; use
   **Retry** to re-send it after fixing your endpoint. Delivered deliveries can't be retried.

### From the API

```bash
curl -X POST https://api.example.com/api/v1/webhooks/$WEBHOOK_ID/test \
  -H "Authorization: Bearer $TOKEN"
# → 202 { "status": "success", "data": { "deliveryId": "…", "status": "pending", "event": "webhook.test" } }

# Inspect exactly what was sent and what your endpoint answered:
curl https://api.example.com/api/v1/webhooks/$WEBHOOK_ID/deliveries/$DELIVERY_ID \
  -H "Authorization: Bearer $TOKEN"
```

The delivery detail includes the request headers that were sent (with the
signature), your response status, the first 2,000 characters of your response
body, the error message and the duration.

### Checklist

- [ ] Endpoint returns `2xx` for a valid `webhook.test`
- [ ] Endpoint returns `401` when you change one byte of the body or the signature
- [ ] Endpoint returns `401` for a request whose `t` is more than 5 minutes old
- [ ] Replaying a captured request (same `X-Webhook-Event-Id` / `X-Webhook-Id`) within 5 minutes does not process it twice
- [ ] Endpoint responds in well under 10 seconds

## Troubleshooting

| Symptom                                       | Likely cause / fix                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Signature never matches                       | You are hashing re-serialised JSON instead of the raw body, using the wrong secret, or verifying `X-Webhook-Signature` with the `t.` prefix |
| Signature fails only sometimes                | Clock drift past 300 s. Sync your server with NTP                                                                             |
| Delivery `dead` with `Blocked URL: …`         | URL resolves to a private/loopback host, or isn't HTTPS in production. Use a public HTTPS endpoint (for local testing use a tunnel) |
| Delivery `dead` with `Rate limit exceeded`    | Raise or remove `rateLimitPerMin` with `PATCH /webhooks/:id`                                                                  |
| Delivery `dead` with `Webhook not found`      | The webhook was deleted while deliveries were pending                                                                         |
| `timeout of 10000ms exceeded`                 | Your handler is too slow. Acknowledge first, process asynchronously                                                          |
| No deliveries for an event                    | The webhook isn't subscribed to it, it's paused (`isActive: false`), or the event is [reserved](#event-catalogue)             |
| Lost the secret                               | Secrets can't be retrieved. Delete the webhook and register it again                                                         |
