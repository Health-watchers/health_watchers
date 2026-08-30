# health-watchers-sdk

Official Python client SDK for the [Health Watchers](https://api.healthwatchers.com) API.

## Install

```bash
pip install health-watchers-sdk
```

Or, for local development against this repo:

```bash
pip install -e sdks/python
```

## Quickstart

### 1. Authenticate and create a patient

```python
from health_watchers import HealthWatchersClient

client = HealthWatchersClient(base_url="https://api.healthwatchers.com/api/v1")

login_response = client.login("doctor@example.com", "hunter2")

# If the account has MFA enabled, the API responds with a temp token instead
# of an access token -- handle that case before proceeding.
if login_response.get("status") == "mfa_required":
    raise RuntimeError(
        "MFA is required for this account; complete the MFA challenge with "
        "the tempToken and set client.access_token manually."
    )

# client.access_token is now set automatically -- every subsequent request
# is authenticated.
patient = client.patients.create(
    first_name="Jane",
    last_name="Doe",
    date_of_birth="1990-01-01",
    sex="female",
    contact_number="+15551234567",
)
print(f"Created patient {patient['systemId']}")
```

### 2. Schedule an appointment

```python
appointment = client.appointments.create(
    patient_id=patient["id"],
    doctor_id="64f1c2b8e1a2c3d4e5f6a7b8",
    scheduled_at="2026-09-15T14:30:00Z",
    duration=30,
    type="consultation",
    chief_complaint="Annual checkup",
)
print(f"Scheduled appointment {appointment['id']} for {appointment['scheduledAt']}")

# List upcoming appointments for a doctor
upcoming = client.appointments.list(doctor_id="64f1c2b8e1a2c3d4e5f6a7b8", status="scheduled")
for appt in upcoming["data"]:
    print(appt["id"], appt["scheduledAt"])
```

### Payments (Stellar)

```python
intent = client.payments.create_intent(
    amount="10.0000000",
    destination="GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB",
    asset_code="XLM",
    patient_id=patient["id"],
)
print(intent["intentId"], intent["memo"])

# ... after the client submits the signed Stellar transaction ...
confirmed = client.payments.confirm_intent(intent["intentId"], tx_hash="abc123...")
print(confirmed["status"])
```

### Verifying webhook signatures

Every webhook delivery includes an `X-Webhook-Signature` header: the
HMAC-SHA256 hex digest of the raw request body, keyed with the webhook's
shared secret. Verify it before trusting the payload:

```python
from health_watchers.webhooks import verify_webhook_signature

# inside your webhook HTTP handler
raw_body = request_body  # the *raw*, unparsed request body string
signature = headers.get("X-Webhook-Signature", "")

if not verify_webhook_signature(webhook_secret, raw_body, signature):
    raise ValueError("Invalid webhook signature")

# safe to parse and process raw_body now
```

### API-key auth mode

For server-to-server integrations, use an API key (created via
`POST /api-keys`) instead of a JWT. It's sent as the `X-API-Key` header on
every request:

```python
client = HealthWatchersClient(
    base_url="https://api.healthwatchers.com/api/v1",
    api_key="hw_live_...",
)

patients = client.patients.list(page=1, limit=20)
```

## Error handling

Non-2xx responses raise `health_watchers.HealthWatchersAPIError`, which
carries `status_code`, `error` (the API's error code, if any), and `message`:

```python
from health_watchers import HealthWatchersAPIError

try:
    client.patients.get("does-not-exist")
except HealthWatchersAPIError as e:
    print(e.status_code, e.error, e.message)
```

## License

MIT
