# Webhooks

Webhooks allow your application to receive real-time notifications when events occur in Health Watchers. Instead of polling, register an HTTPS endpoint and the platform will `POST` a signed payload to it.

> Related: Issue #1253 — real-time event notification delivery.

---

## Supported Events

| Event | Fired when |
|-------|-----------|
| `patient.created` | A new patient record is created |
| `patient.updated` | A patient record is modified |
| `payment.confirmed` | A Stellar payment is confirmed on-chain |
| `payment.failed` | A payment fails or expires |
| `appointment.created` | A new appointment is scheduled |
| `appointment.cancelled` | An appointment is cancelled |
| `encounter.created` | A new clinical encounter is opened |
| `encounter.updated` | An encounter is updated or signed off |
| `lab_result.created` | A lab result is added |
| `lab_result.updated` | A lab result is updated |
| `referral.created` | A referral is created |
| `referral.completed` | A referral is marked complete |
| `immunization.recorded` | An immunization is recorded |
| `care_plan.created` | A care plan is created |
| `care_plan.updated` | A care plan is modified |
| `consent.granted` | A patient grants consent |
| `consent.revoked` | A patient revokes consent |
| `notification.created` | An in-app notification is generated |
| `invoice.created` | A new invoice is created |
| `invoice.paid` | An invoice is marked paid |

Retrieve the full live list at any time:

```http
GET /api/v1/webhooks/events
Authorization: Bearer <token>
```

---

## Registering a Webhook

Requires `CLINIC_ADMIN` or `SUPER_ADMIN` role. The URL must be a **public HTTPS** endpoint — private ranges, loopback, and link-local addresses are rejected by the SSRF allow-list on registration and on every re-delivery.

```http
POST /api/v1/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://yourapp.example/hooks/health-watchers",
  "events": ["payment.confirmed", "patient.created"],
  "description": "Production webhook",
  "retryConfig": {
    "maxRetries": 5,
    "backoffType": "exponential",
    "initialDelayMs": 1000
  },
  "rateLimitPerMin": 120,
  "payloadTemplate": {
    "type": "{{event}}",
    "occurredAt": "{{timestamp}}",
    "payload": "{{data}}"
  }
}
```

`rateLimitPerMin` caps how many deliveries are enqueued for this webhook in any rolling 60-second window. Set to `0` to disable. Excess events are stored as `dead` deliveries with a rate-limit error rather than silently dropped.

`payloadTemplate` is optional — see [Payload Templating](#payload-templating).

**Response `201`:**

```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "url": "https://yourapp.example/hooks/health-watchers",
    "events": ["payment.confirmed", "patient.created"],
    "secret": "a3f2...c9d1",
    "description": "Production webhook",
    "retryConfig": { "maxRetries": 5, "backoffType": "exponential", "initialDelayMs": 1000 },
    "rateLimitPerMin": 120,
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

> **Save the `secret` immediately.** It is returned only once and never shown again. It is required to verify incoming webhook signatures.

---

## Webhook Payload Structure

Every delivery `POST`s this envelope to your endpoint:

```json
{
  "event": "patient.created",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "fullName": "John Doe",
    "clinicId": "507f1f77bcf86cd799439012"
  },
  "timestamp": "2025-01-15T10:05:00.000Z"
}
```

Outbound headers on every delivery:

| Header | Meaning |
|--------|---------|
| `X-Webhook-Id` | Delivery ID (for support / idempotency) |
| `X-Webhook-Event` | Event name |
| `X-Webhook-Attempt` | 1-based attempt number |
| `X-Webhook-Timestamp` | Unix seconds the request was signed |
| `X-Webhook-Signature` | Legacy — bare hex `HMAC_SHA256(secret, body)` |
| `X-Webhook-Signature-256` | `t=<ts>,v1=<hex HMAC_SHA256(secret, "<ts>.<body>")>` |

---

## Verifying Signatures

### Recommended: `X-Webhook-Signature-256` (timestamp-bound)

The `-256` header includes a timestamp in the signed string to prevent replay attacks:

```
parse t, v1 from X-Webhook-Signature-256
reject if |now - t| > 300 seconds          # 5-minute replay window
expected = HMAC_SHA256(secret, t + "." + rawBody)
reject unless constantTimeEqual(expected, v1)
```

Because the timestamp is part of the signed string, a captured request cannot be replayed later or against a different body.

### Legacy: `X-Webhook-Signature`

The legacy header (`HMAC_SHA256(secret, rawBody)` with no timestamp) is still sent so existing receivers keep working. New integrations should use `-256`.

### Node.js example

```javascript
const crypto = require('crypto');

function verifyWebhookSignature256(secret, rawBody, header) {
  // header format: "t=<unix_ts>,v1=<hex>"
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const ts = parts['t'];
  const v1 = parts['v1'];

  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    throw new Error('Timestamp outside replay window');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

// Express example
app.post('/hooks/health-watchers', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.headers['x-webhook-signature-256'];
  if (!verifyWebhookSignature256(process.env.HW_WEBHOOK_SECRET, req.body, header)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const { event, data, timestamp } = JSON.parse(req.body);
  // process asynchronously...
  res.sendStatus(200);
});
```

### Python example

```python
import hmac, hashlib, time

def verify_signature_256(secret: str, raw_body: bytes, header: str) -> bool:
    parts = dict(p.split('=', 1) for p in header.split(','))
    ts = parts['t']
    v1 = parts['v1']

    if abs(time.time() - float(ts)) > 300:
        raise ValueError('Timestamp outside replay window')

    expected = hmac.new(
        secret.encode(),
        f"{ts}.".encode() + raw_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, v1)
```

> **Important:** Always pass `req.body` as **raw bytes** before JSON parsing. The HMAC is computed over the exact bytes received.

---

## Retry Behaviour

If your endpoint returns a non-2xx status or times out (10-second timeout), the delivery is retried automatically by the `retry-worker`, which scans for `status: 'pending'` deliveries whose `nextRetryAt` is due every 30 seconds.

| Config | Default | Range |
|--------|---------|-------|
| `maxRetries` | 3 | 1–10 |
| `backoffType` | `exponential` | `exponential`, `linear`, `fixed` |
| `initialDelayMs` | 1000 ms | 100–60000 ms |

**Backoff delay formula:**

| Type | Formula |
|------|---------|
| `exponential` | `initialDelayMs × 2^attempt` (1s, 2s, 4s, 8s…) |
| `linear` | `initialDelayMs × (attempt + 1)` (1s, 2s, 3s…) |
| `fixed` | `initialDelayMs` always |

After all retries are exhausted the delivery moves to `status: 'dead'` (dead-letter) and the event log entry is marked `dead`.

---

## Delivery Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Queued or awaiting retry |
| `delivered` | Your endpoint returned 2xx |
| `failed` | Attempt failed but retries remain |
| `dead` | All retries exhausted |

---

## Test Events

`POST /api/v1/webhooks/:id/test` queues a synthetic `webhook.test` event so integrators can validate their endpoint and signature handling before going live. Test events are flagged `isTest` in delivery history and bypass the per-webhook rate limit. `webhook.test` cannot be subscribed to as a normal event.

```http
POST /api/v1/webhooks/:id/test
Authorization: Bearer <token>
```

---

## Payload Templating

When `payloadTemplate` is set on a webhook, string leaves may contain `{{dotted.path}}` placeholders resolved against `{ event, data, timestamp, webhookId, metadata }`:

- A leaf that is exactly one placeholder keeps the resolved value's **type** (`"{{data}}"` → the object)
- A leaf with surrounding text renders as a string (`"evt:{{event}}"`)
- Unknown paths render as `""`
- No logic or function calls — templates can only reshape the payload

Send `payloadTemplate: null` on `PATCH` to clear it and revert to the raw envelope.

---

## Managing Webhooks

### List webhooks

```http
GET /api/v1/webhooks
Authorization: Bearer <token>
```

### Get a single webhook

```http
GET /api/v1/webhooks/:id
Authorization: Bearer <token>
```

### Update a webhook

```http
PATCH /api/v1/webhooks/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "events": ["payment.confirmed", "payment.failed", "invoice.paid"],
  "isActive": true
}
```

### Disable a webhook (without deleting)

```http
PATCH /api/v1/webhooks/:id
Authorization: Bearer <token>
Content-Type: application/json

{ "isActive": false }
```

### Delete a webhook

```http
DELETE /api/v1/webhooks/:id
Authorization: Bearer <token>
```

Deletes the webhook and purges all delivery and event log records.

---

## Delivery Logs

### View delivery history (last 50)

```http
GET /api/v1/webhooks/:id/deliveries
Authorization: Bearer <token>
```

```json
{
  "status": "success",
  "data": [
    {
      "id": "...",
      "event": "payment.confirmed",
      "status": "delivered",
      "attempts": 1,
      "responseStatus": 200,
      "lastAttemptAt": "2025-01-15T10:05:01.000Z"
    },
    {
      "id": "...",
      "event": "patient.created",
      "status": "dead",
      "attempts": 5,
      "error": "connect ECONNREFUSED",
      "lastAttemptAt": "2025-01-15T10:10:00.000Z"
    }
  ]
}
```

### View a single delivery (full detail)

```http
GET /api/v1/webhooks/:id/deliveries/:deliveryId
Authorization: Bearer <token>
```

Returns request headers, request body, response status/body, and `durationMs`.

### Manually retry a dead delivery

```http
POST /api/v1/webhooks/:id/deliveries/:deliveryId/retry
Authorization: Bearer <token>
```

### Delivery stats overview

```http
GET /api/v1/webhooks/stats/overview
Authorization: Bearer <token>
```

Returns per-clinic counts broken down by delivery status.

---

## Inbound Stellar Payment Webhook

Health Watchers exposes an **inbound** webhook for the Stellar service to notify the platform of on-chain payments. Used internally by the Stellar stream service — no Bearer token required, but the HMAC signature must be verified.

```http
POST /api/v1/webhooks/stellar-payment
X-Webhook-Signature: <hmac-sha256-hex>
Content-Type: application/json

{
  "transactionHash": "abc123...",
  "amount": "10.0000000",
  "destination": "GCEZ...",
  "memo": "HW-abc123",
  "status": "confirmed"
}
```

### Configuring an inbound webhook receiver

1. **Set the signing secret(s)** on the API via environment variables:

   | Variable | Purpose |
   |----------|---------|
   | `WEBHOOK_INBOUND_SECRET` | Current HMAC-SHA256 signing secret |
   | `WEBHOOK_INBOUND_SECRET_PREVIOUS` | Optional previous secret, accepted during rotation |
   | `WEBHOOK_INBOUND_SECRET_ROTATED_AT` | ISO-8601 timestamp of the last rotation |

   Secrets should be at least 32 random bytes (e.g. `openssl rand -hex 32`).

2. **Compute the signature** over the **raw request body** (exact bytes, before JSON parsing):

   ```
   X-Webhook-Signature = hex(HMAC_SHA256(secret, rawBody))
   ```

3. **Send the header** on every request. The header name is case-insensitive (`X-Webhook-Signature`).

### Verification and error behaviour

The API verifies `X-Webhook-Signature` on **every** incoming webhook request:

| Condition | Response |
|-----------|----------|
| Header missing | `401 Unauthorized` — `{ "error": "Missing webhook signature" }` |
| Header present but does not match | `401 Unauthorized` — `{ "error": "Invalid webhook signature" }` |
| Signature matches current or previous secret | Request is processed normally |

Signature comparison is constant-time. The raw body must be preserved — frameworks that re-serialize JSON will produce a different signature.

### Secret rotation

Rotate the inbound signing secret without downtime:

1. Generate a new secret: `openssl rand -hex 32`.
2. Move the current value of `WEBHOOK_INBOUND_SECRET` into `WEBHOOK_INBOUND_SECRET_PREVIOUS`.
3. Set `WEBHOOK_INBOUND_SECRET` to the new value and update `WEBHOOK_INBOUND_SECRET_ROTATED_AT`.
4. Deploy. During the overlap window the API accepts signatures produced with **either** the current or the previous secret, so senders can migrate at their own pace.
5. Once all senders use the new secret, clear `WEBHOOK_INBOUND_SECRET_PREVIOUS` and redeploy. After this point only the current secret is accepted.

> Rotate immediately if a secret is suspected to be compromised, and treat the previous-secret window as short as operationally possible.

---

## Idempotency for Payment Endpoints

Network retries can cause duplicate payment submissions. The following endpoints accept an `Idempotency-Key` header:

| Endpoint | Method |
|----------|--------|
| `/api/v1/payments` | `POST` |
| `/api/v1/payments/batch` | `POST` |
| `/api/v1/payments/recurring` | `POST` |

### Header

```http
POST /api/v1/payments
Authorization: Bearer <token>
Idempotency-Key: 4f1c2b9e-8a3d-4c6f-9b2e-1d7a5c3e9f01
Content-Type: application/json

{ "amount": "10.0000000", "destination": "GCEZ...", "memo": "HW-abc123" }
```

- The key is a client-generated string (a UUIDv4 is recommended). Maximum length 255 characters.
- The header is **required** on all three endpoints. A request without it is rejected with `400 Bad Request` — `{ "error": "Idempotency-Key header is required" }`.
- Keys are scoped per authenticated user/clinic; reusing a key for a different endpoint or payload is treated as a new request only if the key has expired.

### Replay semantics

- The first request with a given key is processed normally. The response (status code and body) is stored in Redis under the key with a **24-hour TTL**.
- Any subsequent request with the **same key** within 24 hours returns the **cached response** — identical status code and body — without re-executing the payment. This makes retries safe.
- A unique index on the idempotency key in MongoDB acts as a fallback if the Redis entry is evicted; a duplicate insert is resolved to the original stored response.
- After 24 hours the key expires and may be reused for a new payment.

> **Tip:** Generate a fresh key per logical payment attempt and reuse the same key for every retry of that attempt.

---

## Security Practices

1. **SSRF protection** — webhook URLs are validated against an allow-list on registration and on every re-delivery. Private ranges, loopback, and link-local addresses are rejected.
2. **Secrets** — generated with `crypto.randomBytes(32)` and only returned at creation time. Rotate by deleting and re-creating the webhook if the secret is exposed.
3. **Verify `X-Webhook-Signature-256`** — always verify the signature **and** check timestamp freshness (± 5 minutes) before processing any payload.
4. **Treat body as untrusted** — never use body fields in a regex or DB `$where` before the signature checks out.
5. **Respond quickly** — return `200` within the 10-second timeout and process asynchronously. Slow receivers trigger retries and consume your `rateLimitPerMin` budget.
6. **Idempotency** — the same event may be delivered more than once (retries, manual replay). Use `X-Webhook-Id` or `timestamp` + `data.id` to deduplicate.
7. **Use HTTPS** — plain HTTP endpoints are blocked by URL validation.
8. **Monitor dead deliveries** — set up alerts on the `dead` status in your delivery log.
