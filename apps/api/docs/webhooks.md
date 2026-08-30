# Webhook System

> Issue #1253 — real-time event notification delivery.

## Registering a webhook

`POST /api/v1/webhooks` (CLINIC_ADMIN / SUPER_ADMIN)

```jsonc
{
  "url": "https://example.com/hooks/health-watchers",  // must be public HTTPS, not a private/loopback IP
  "events": ["patient.created", "payment.confirmed"],   // >=1, from GET /webhooks/events
  "description": "CRM sync",
  "retryConfig": { "maxRetries": 5, "backoffType": "exponential", "initialDelayMs": 1000 },
  "rateLimitPerMin": 120,                                // optional, 0 = no per-webhook cap
  "payloadTemplate": {                                   // optional, see "Templating"
    "type": "{{event}}",
    "occurredAt": "{{timestamp}}",
    "payload": "{{data}}"
  }
}
```

The response includes the signing `secret` **once**. Store it — it is required to
verify signatures and is never returned again.

## Delivery

Each event is written to `WebhookDelivery` and sent with `POST`. Outbound
headers:

| Header | Meaning |
|--------|---------|
| `X-Webhook-Id` | delivery id (for support / idempotency) |
| `X-Webhook-Event` | event name |
| `X-Webhook-Attempt` | 1-based attempt number |
| `X-Webhook-Timestamp` | unix seconds the request was signed |
| `X-Webhook-Signature` | **legacy** — bare hex `HMAC_SHA256(secret, body)` |
| `X-Webhook-Signature-256` | `t=<ts>,v1=<hex HMAC_SHA256(secret, "<ts>.<body>")>` |

### Verifying (recommended: `X-Webhook-Signature-256`)

```
parse t, v1 from X-Webhook-Signature-256
reject if |now - t| > 300 seconds          # replay window
expected = HMAC_SHA256(secret, t + "." + rawBody)
reject unless constantTimeEqual(expected, v1)
```

Because the timestamp is part of the signed string, a captured request cannot be
replayed later or against a different body. `verifySignature()` in
`webhook-signature.ts` implements exactly this and is used for inbound
verification.

The legacy `X-Webhook-Signature` header (no timestamp) is still sent so existing
receivers keep working; new integrations should prefer the `-256` header.

## Retries & backoff

Failed deliveries (network error or non-2xx) are retried up to
`retryConfig.maxRetries` with `exponential` (default), `linear` or `fixed`
backoff. The `retry-worker` scans for `status: 'pending'` deliveries whose
`nextRetryAt` is due every 30s. After the last attempt the delivery moves to
`status: 'dead'` (dead-letter) and the event log is marked `dead`.

Manual replay: `POST /webhooks/:id/deliveries/:deliveryId/retry`.

## Test events

`POST /api/v1/webhooks/:id/test` queues a synthetic `webhook.test` event
(flagged `isTest` in history, bypasses the per-webhook rate limit) so
integrators can validate their endpoint and signature handling before going
live. `webhook.test` cannot be subscribed to as a normal event.

## Per-webhook rate limiting

`rateLimitPerMin` caps how many deliveries are enqueued for one webhook in any
rolling 60-second window (`webhook-rate-limiter.ts`). Excess events are stored as
`dead` deliveries with a rate-limit error so they are visible in history rather
than silently dropped. `0` disables the per-webhook cap.

## Templating

When `payloadTemplate` is set, string leaves may contain `{{ dotted.path }}`
placeholders resolved against `{ event, data, timestamp, webhookId, metadata }`:

- a leaf that is exactly one placeholder keeps the resolved value's **type**
  (`"{{data}}"` → the object)
- a leaf with surrounding text renders a string (`"evt:{{event}}"`)
- unknown paths render as `""`
- there is no logic, no function calls — a template can only reshape the payload

Send `payloadTemplate: null` on `PATCH` to clear it and go back to the raw
envelope.

## Delivery history & debugging

| Endpoint | Returns |
|----------|---------|
| `GET /webhooks/:id/deliveries` | last 50 deliveries (summary) |
| `GET /webhooks/:id/deliveries/:deliveryId` | one delivery incl. request headers, request body, response status/body, `durationMs` |
| `GET /webhooks/:id/events` | paginated event log |
| `GET /webhooks/stats/overview` | per-clinic counts by delivery status |

## Security practices

1. Webhook URLs are validated against an SSRF allow-list on register and on
   every (re)delivery — private ranges, loopback and link-local are rejected.
2. Secrets are generated with `crypto.randomBytes(32)` and only ever returned at
   creation time.
3. Always verify `X-Webhook-Signature-256` **and** the timestamp freshness.
4. Treat the request body as untrusted until the signature checks out — in
   particular never use body fields in a regex or DB `$where`.
5. Respond `2xx` quickly and process asynchronously; slow receivers trigger
   retries and waste your `rateLimitPerMin` budget.
6. Rotate the secret by deleting and re-creating the webhook if it is exposed.
