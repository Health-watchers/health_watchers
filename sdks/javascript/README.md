# @health-watchers/sdk

Official JavaScript/TypeScript client SDK for the [Health Watchers](https://healthwatchers.com) API — a
thin, typed wrapper around the REST endpoints described in the
[API integration guide](../../docs/API_DOCUMENTATION.md).

## Install

```bash
npm install @health-watchers/sdk
```

## Quickstart

### 1. Create a client and authenticate

```typescript
import { HealthWatchersClient } from '@health-watchers/sdk';

const client = new HealthWatchersClient({
  baseUrl: 'https://api.healthwatchers.com/api/v1',
});

const login = await client.login('doctor@example-clinic.com', 'correct-horse-battery-staple');

if (login.status === 'mfa_required') {
  // The account has 2FA enabled — complete the MFA challenge with
  // `login.data.tempToken` via your own flow, then set the resulting
  // access token on the client:
  // client.setAccessToken(accessTokenFromMfaChallenge);
  throw new Error('MFA challenge required — see login.data.tempToken');
}

// On success, client.login() also stores the access token on the client,
// so this call is optional — but the tokens are returned if you want to
// persist them yourself (e.g. for a refresh flow):
const { accessToken, refreshToken } = login.data;
```

### 2. Create a patient

```typescript
const patient = await client.patients.create({
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-05-14',
  sex: 'F',
  contactNumber: '+1-555-0100',
  address: '123 Analytical Engine Way',
});

console.log(patient.id, patient.systemId); // e.g. "HW-ABC123-000042"
```

### 3. Schedule an appointment

```typescript
const appointment = await client.appointments.create({
  patientId: patient.id,
  doctorId: '507f1f77bcf86cd799439011',
  scheduledAt: '2026-09-15T14:30:00.000Z',
  duration: 30, // minutes — optional, defaults to 30 server-side
  type: 'consultation',
  chiefComplaint: 'Annual checkup',
});

console.log(appointment.id, appointment.status); // "scheduled"
```

### Listing and pagination

```typescript
const { data: patients, pagination } = await client.patients.list({ page: 1, limit: 20 });

const { data: appointments } = await client.appointments.list({
  doctorId: '507f1f77bcf86cd799439011',
  status: 'scheduled',
  dateFrom: '2026-09-01T00:00:00.000Z',
  dateTo: '2026-09-30T23:59:59.000Z',
});
```

### Payments (Stellar)

```typescript
const intent = await client.payments.createIntent({
  amount: '10.0000000',
  destination: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB',
  assetCode: 'XLM',
  patientId: patient.id,
});

// ...caller submits & confirms the Stellar transaction using intent.memo/intent.destination...

const confirmed = await client.payments.confirmIntent(intent.intentId, '<stellar-tx-hash>');
console.log(confirmed.status); // "confirmed"
```

## Authentication modes

The SDK supports both auth modes the API accepts:

- **JWT (user session)** — call `client.login(email, password)`, or pass an existing token:

  ```typescript
  const client = new HealthWatchersClient({
    baseUrl: 'https://api.healthwatchers.com/api/v1',
    accessToken: 'eyJhbGciOi...',
  });
  ```

- **API key (service-to-service)** — create a key via `POST /api-keys` (requires a bearer session)
  and pass it directly; it's sent as the `X-API-Key` header:

  ```typescript
  const client = new HealthWatchersClient({
    baseUrl: 'https://api.healthwatchers.com/api/v1',
    apiKey: 'hw_Kx9mN2pQ7rT4vW1yZ3aB6cD8eF0gH5iJ',
  });
  ```

If both `accessToken` and `apiKey` are configured, the bearer token takes precedence.

## Verifying webhook signatures

Every webhook delivery includes an `X-Webhook-Signature` header — an HMAC-SHA256 hex digest of the
raw request body, signed with your webhook's secret. Use `verifyWebhookSignature` to check it
before trusting a payload:

```typescript
import { verifyWebhookSignature } from '@health-watchers/sdk';
import express from 'express';

const app = express();

app.post(
  '/webhooks/health-watchers',
  express.text({ type: '*/*' }), // capture the raw body, not a parsed object
  (req, res) => {
    const signature = req.header('X-Webhook-Signature') ?? '';
    const isValid = verifyWebhookSignature(process.env.HW_WEBHOOK_SECRET!, req.body, signature);

    if (!isValid) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(req.body);
    // ...handle event...
    res.status(200).end();
  }
);
```

`verifyWebhookSignature` must be given the *raw* request body string exactly as received —
re-serializing a parsed JSON object before verifying can change key order/whitespace and cause a
false negative.

## API surface

- `client.login(email, password)`
- `client.patients.create(data)`, `client.patients.list(params)`, `client.patients.get(id)`
- `client.appointments.create(data)`, `client.appointments.list(params)`, `client.appointments.get(id)`
- `client.payments.createIntent(data)`, `client.payments.confirmIntent(intentId, txHash)`
- `verifyWebhookSignature(secret, payload, signature)`

See [`src/types.ts`](./src/types.ts) for the full request/response type definitions.

## Development

This package is a standalone package (not part of the main repo's npm workspaces).

```bash
cd sdks/javascript
npm install
npm run build
```
