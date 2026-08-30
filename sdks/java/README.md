# Health Watchers Java SDK

A small Java client for the Health Watchers REST API (`/api/v1`), built on
[OkHttp](https://square.github.io/okhttp/) and [Gson](https://github.com/google/gson).

This module lives at `sdks/java/` as a **standalone Maven project** — it is not part of the
health_watchers monorepo's own build, and can be built and consumed independently.

> Companion to GitHub issue #1278 ("Create API integration guide for third-party developers").
> For the full endpoint reference, see `apps/api/src/docs/swagger.ts` (served at `/api-docs`).

## Install

Build and install the SDK into your local Maven repository:

```bash
cd sdks/java
mvn clean install
```

Then depend on it from your own project:

```xml
<dependency>
  <groupId>com.healthwatchers</groupId>
  <artifactId>health-watchers-sdk</artifactId>
  <version>0.1.0</version>
</dependency>
```

Requires Java 11 or newer.

## Authentication

The API supports two auth modes, and the SDK mirrors both:

| Mode | Header sent | How to construct the client |
|---|---|---|
| JWT (user login) | `Authorization: Bearer <token>` | `new HealthWatchersClient(baseUrl)`, then `client.login(email, password)` |
| API key (service-to-service) | `X-API-Key: <key>` | `HealthWatchersClient.withApiKey(baseUrl, apiKey)` |

`baseUrl` includes the `/api/v1` prefix, e.g. `https://api.healthwatchers.com/api/v1`
(or `http://localhost:3001/api/v1` for local development).

## Quickstart 1: Import / create a patient

```java
import com.healthwatchers.sdk.HealthWatchersClient;
import com.healthwatchers.sdk.MfaRequiredException;
import com.healthwatchers.sdk.model.CreatePatientRequest;
import com.healthwatchers.sdk.model.Patient;

public class ImportPatient {
  public static void main(String[] args) throws Exception {
    HealthWatchersClient client =
        new HealthWatchersClient("https://api.healthwatchers.com/api/v1");

    try {
      client.login("doctor@example-clinic.com", "correct-horse-battery-staple");
    } catch (MfaRequiredException mfa) {
      // Account has MFA enabled — collect the user's TOTP code out of band and complete
      // verification using mfa.getTempToken() against the API's MFA endpoint.
      throw new IllegalStateException("MFA verification required, temp token: " + mfa.getTempToken());
    }

    CreatePatientRequest newPatient =
        new CreatePatientRequest("Ada", "Lovelace", "1990-05-14", "F")
            .contactNumber("+15551234567")
            .address("123 Analytical Engine Way");

    Patient created = client.patients().create(newPatient);
    System.out.println("Created patient " + created.systemId + " (id=" + created.id + ")");

    // List patients, page 1, 20 per page
    var page = client.patients().list(1, 20, null);
    System.out.println("Clinic has " + page.getPagination().total + " patients on file");
  }
}
```

Notes on `CreatePatientRequest`:
- `sex` must be one of `"M"`, `"F"`, `"O"`.
- `dateOfBirth` is an ISO-8601 date string (`YYYY-MM-DD`) and cannot be in the future.
- `clinicId` is deliberately **not** a field — the API always scopes a new patient to the
  clinic of the authenticated caller.

## Quickstart 2: Schedule an appointment

```java
import com.healthwatchers.sdk.AppointmentsClient;
import com.healthwatchers.sdk.HealthWatchersApiException;
import com.healthwatchers.sdk.HealthWatchersClient;
import com.healthwatchers.sdk.model.Appointment;
import com.healthwatchers.sdk.model.AppointmentListParams;
import com.healthwatchers.sdk.model.CreateAppointmentRequest;
import com.healthwatchers.sdk.model.PagedResult;

public class ScheduleAppointment {
  public static void main(String[] args) throws Exception {
    HealthWatchersClient client =
        new HealthWatchersClient("https://api.healthwatchers.com/api/v1");
    client.login("doctor@example-clinic.com", "correct-horse-battery-staple");

    CreateAppointmentRequest request =
        new CreateAppointmentRequest(
                /* patientId */ "665f1a2b3c4d5e6f7a8b9c0d",
                /* doctorId  */ "665f1a2b3c4d5e6f7a8b9c0e",
                /* scheduledAt */ "2026-09-15T14:30:00Z",
                /* type */ "follow_up")
            .duration(30)
            .chiefComplaint("Routine follow-up")
            .notes("Patient requested a morning slot next time");

    try {
      Appointment appointment = client.appointments().create(request);
      System.out.println("Scheduled appointment " + appointment.id
          + " for " + appointment.scheduledAt);
    } catch (HealthWatchersApiException e) {
      if ("TimeSlotUnavailable".equals(e.getErrorCode())
          || "DoctorUnavailable".equals(e.getErrorCode())) {
        System.out.println("That slot is taken, try another time: " + e.getMessage());
      } else {
        throw e;
      }
    }

    // List a doctor's upcoming scheduled appointments
    AppointmentsClient appointments = client.appointments();
    PagedResult<Appointment> upcoming =
        appointments.list(
            new AppointmentListParams()
                .doctorId("665f1a2b3c4d5e6f7a8b9c0e")
                .status("scheduled")
                .page(1)
                .limit(20));

    upcoming.getData().forEach(a -> System.out.println(a.scheduledAt + " — " + a.type));
  }
}
```

## Payments (Stellar)

```java
import com.healthwatchers.sdk.model.CreatePaymentIntentRequest;
import com.healthwatchers.sdk.model.PaymentIntent;

CreatePaymentIntentRequest intentRequest =
    new CreatePaymentIntentRequest("10.0000000", "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB")
        .patientId("665f1a2b3c4d5e6f7a8b9c0d")
        .assetCode("XLM");

PaymentIntent intent = client.payments().createIntent(intentRequest);
System.out.println("Send payment to " + intent.platformPublicKey
    + " with intentId " + intent.intentId);

// After the Stellar transaction is submitted and has a hash:
PaymentIntent confirmed = client.payments().confirmIntent(intent.intentId, "abcd1234...txhash");
System.out.println("Payment status: " + confirmed.status);
```

## API-key mode

For service-to-service integrations (no interactive login), mint a key via
`POST /api-keys` (using a bearer token) and construct the client with it directly:

```java
import com.healthwatchers.sdk.HealthWatchersClient;

HealthWatchersClient client =
    HealthWatchersClient.withApiKey("https://api.healthwatchers.com/api/v1", "hw_yourrawapikey...");

// No login() call needed or possible — every request sends X-API-Key automatically.
var patient = client.patients().get("665f1a2b3c4d5e6f7a8b9c0d");
```

## Verifying webhook signatures

Every webhook delivery is sent with an `X-Webhook-Signature` header containing the
lowercase hex-encoded HMAC-SHA256 of the *raw* request body, keyed with the webhook's
secret (see `apps/api/src/modules/webhooks/webhook.service.ts#generateWebhookSignature`).
Verify it before trusting the payload, e.g. in a Spring/Servlet webhook endpoint:

```java
import com.healthwatchers.sdk.WebhookVerifier;

@PostMapping("/webhooks/health-watchers")
public ResponseEntity<Void> handleWebhook(
    @RequestHeader("X-Webhook-Signature") String signature,
    @RequestBody String rawBody) {

  String webhookSecret = System.getenv("HEALTH_WATCHERS_WEBHOOK_SECRET");

  if (!WebhookVerifier.verifySignature(webhookSecret, rawBody, signature)) {
    return ResponseEntity.status(401).build();
  }

  // Signature verified — now safe to parse `rawBody` and act on the event.
  return ResponseEntity.ok().build();
}
```

`WebhookVerifier.verifySignature` recomputes the HMAC using `javax.crypto.Mac` and compares
it to the supplied header value with `java.security.MessageDigest.isEqual` (constant-time),
matching the server's own `verifyWebhookSignature` behavior in `webhook.service.ts`.

**Important:** pass the exact raw bytes/string of the request body as received on the wire.
Re-serializing a parsed-and-re-encoded copy of the JSON will usually change byte-for-byte
formatting (key order, whitespace) and cause the signature check to fail even for a
legitimate delivery.

## Error handling

All resource-client methods throw:

- `java.io.IOException` — network-level failures (connection refused, timeout, etc.)
- `com.healthwatchers.sdk.HealthWatchersApiException` — the API responded with a non-2xx
  status, or a success-shaped response carrying an `error` field. Carries
  `getHttpStatusCode()` and `getErrorCode()` (e.g. `"NotFound"`, `"TimeSlotUnavailable"`,
  `"AccountLocked"`) alongside a human-readable `getMessage()`.
- `com.healthwatchers.sdk.MfaRequiredException` (a subclass of the above) — thrown only from
  `login(...)` when the account has MFA enabled.

## Module layout

```
sdks/java/
├── pom.xml
├── README.md
└── src/main/java/com/healthwatchers/sdk/
    ├── HealthWatchersClient.java   // entry point: auth + shared request/response plumbing
    ├── PatientsClient.java         // GET/POST /patients, GET /patients/:id
    ├── AppointmentsClient.java     // GET/POST /appointments, GET /appointments/:id
    ├── PaymentsClient.java         // POST /payments/intent, PATCH /payments/:id/confirm
    ├── WebhookVerifier.java        // HMAC-SHA256 X-Webhook-Signature verification
    ├── HealthWatchersApiException.java
    ├── MfaRequiredException.java
    └── model/                     // request/response POJOs (Gson-friendly plain fields)
```
