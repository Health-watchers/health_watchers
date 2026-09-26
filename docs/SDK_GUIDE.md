# Client SDKs

Official client libraries for the Health Watchers API, for third-party developers
integrating patient management, scheduling, and payments (see the
[API integration guide](API_DOCUMENTATION.md) for the full endpoint reference and
[the auth flow diagram](diagrams/auth-flow.mmd) for how login/tokens work).

Each SDK is a small, standalone package — not part of this repo's own build — covering the
same core surface: authentication (JWT login or API key), patients, appointments, payment
intents, and webhook signature verification.

| Language | Package | Source | README |
|---|---|---|---|
| JavaScript / TypeScript | `@health-watchers/sdk` (npm) | [`sdks/javascript/`](../sdks/javascript/) | [README](../sdks/javascript/README.md) |
| Python | `health-watchers-sdk` (PyPI) | [`sdks/python/`](../sdks/python/) | [README](../sdks/python/README.md) |
| Java | `com.healthwatchers:health-watchers-sdk` (Maven) | [`sdks/java/`](../sdks/java/) | [README](../sdks/java/README.md) |

## JavaScript / TypeScript

```bash
npm install @health-watchers/sdk
```

A thin, typed axios-based client. Install locally from this repo with
`npm install ./sdks/javascript` while it's unpublished. See the
[full README](../sdks/javascript/README.md) for pagination, both auth modes, and error
handling.

## Python

```bash
pip install health-watchers-sdk
```

A `requests`-based client with snake_case method names and a
`HealthWatchersAPIError` for non-2xx responses. See the
[full README](../sdks/python/README.md).

## Java

```xml
<dependency>
  <groupId>com.healthwatchers</groupId>
  <artifactId>health-watchers-sdk</artifactId>
  <version>0.1.0</version>
</dependency>
```

Built on OkHttp + Gson, Java 11+. Build and install locally with
`cd sdks/java && mvn clean install` while it's unpublished. See the
[full README](../sdks/java/README.md).

## Quickstart: import a patient and schedule an appointment

The same two calls, side by side.

<table>
<tr><th>JavaScript / TypeScript</th><th>Python</th><th>Java</th></tr>
<tr valign="top">
<td>

```typescript
import { HealthWatchersClient } from '@health-watchers/sdk';

const client = new HealthWatchersClient({
  baseUrl: 'https://api.healthwatchers.com/api/v1',
});
await client.login('doctor@clinic.com', 'password');

const patient = await client.patients.create({
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-05-14',
  sex: 'F',
});

const appt = await client.appointments.create({
  patientId: patient.id,
  doctorId: '507f1f77bcf86cd799439011',
  scheduledAt: '2026-09-15T14:30:00.000Z',
  type: 'consultation',
});
```

</td>
<td>

```python
from health_watchers import HealthWatchersClient

client = HealthWatchersClient(
    base_url="https://api.healthwatchers.com/api/v1",
)
client.login("doctor@clinic.com", "password")

patient = client.patients.create(
    first_name="Ada",
    last_name="Lovelace",
    date_of_birth="1990-05-14",
    sex="F",
)

appt = client.appointments.create(
    patient_id=patient["id"],
    doctor_id="507f1f77bcf86cd799439011",
    scheduled_at="2026-09-15T14:30:00Z",
    type="consultation",
)
```

</td>
<td>

```java
HealthWatchersClient client =
    new HealthWatchersClient(
        "https://api.healthwatchers.com/api/v1");
client.login("doctor@clinic.com", "password");

Patient patient = client.patients().create(
    new CreatePatientRequest(
        "Ada", "Lovelace", "1990-05-14", "F"));

Appointment appt = client.appointments().create(
    new CreateAppointmentRequest(
        patient.id,
        "507f1f77bcf86cd799439011",
        "2026-09-15T14:30:00Z",
        "consultation"));
```

</td>
</tr>
</table>

## Webhook signature verification

All three SDKs expose a helper that recomputes the `X-Webhook-Signature` header
(HMAC-SHA256 of the raw request body, matching
[`webhook.service.ts`](../apps/api/src/modules/webhooks/webhook.service.ts)) and compares
it in constant time: `verifyWebhookSignature` (JS), `verify_webhook_signature` (Python),
`WebhookVerifier.verifySignature` (Java). Always verify against the *raw* body bytes, before
JSON-parsing — see each SDK's README for a full handler example.

## Scope and limitations

These are minimal, hand-written clients covering the integration use cases named in issue
#1278 (patient import, appointment scheduling, payments, webhooks) — not full 1:1 wrappers
of every API endpoint. None of the three have been built/installed or run against a live
API in this environment (no network access to npm/PyPI/Maven registries at SDK-authoring
time); read through each SDK's source before depending on it, and treat the request/response
field names as accurate-as-of-writing (they were taken directly from the corresponding
controller/validation/transformer source files, not guessed) but unverified end-to-end.
