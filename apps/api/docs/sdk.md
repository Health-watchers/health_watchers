# SDK Documentation

Health Watchers does not currently publish an official SDK package. This guide provides reusable client patterns for **JavaScript/TypeScript**, **Python**, and **cURL** that cover authentication, token refresh, pagination, error handling, and webhook signature verification.

---

## JavaScript / TypeScript SDK Pattern

### Installation (no package needed)

Copy the client class into your project. It requires only the native `fetch` API (Node 18+, all modern browsers).

### `HealthWatchersClient`

```typescript
// health-watchers-client.ts

export interface HWConfig {
  baseUrl: string;   // e.g. "https://api.healthwatchers.io/api/v1"
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class HealthWatchersClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(private config: HWConfig) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  async login(): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: this.config.email,
        password: this.config.password,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Login failed: ${err.message}`);
    }

    const { data } = await res.json();

    // MFA required — caller must handle interactively
    if (data.mfaRequired) {
      throw new Error('MFA_REQUIRED: call completeMfaChallenge() with tempToken and totp');
    }

    this.storeTokens(data);
  }

  async completeMfaChallenge(tempToken: string, totp: string): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/auth/mfa/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, totp }),
    });

    if (!res.ok) throw new Error('MFA challenge failed');
    const { data } = await res.json();
    this.storeTokens(data);
  }

  async logout(): Promise<void> {
    if (!this.refreshToken) return;
    await this.fetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    this.accessToken = null;
    this.refreshToken = null;
  }

  private storeTokens(data: TokenPair) {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
  }

  private async refreshTokens(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const res = await fetch(`${this.config.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!res.ok) {
        this.accessToken = null;
        this.refreshToken = null;
        throw new Error('Session expired — please log in again');
      }

      const { data } = await res.json();
      this.storeTokens(data);
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  // ── Core request helper ─────────────────────────────────────────────────────

  async fetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) await this.login();

    const doRequest = async (): Promise<Response> => {
      return fetch(`${this.config.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          ...(options.headers ?? {}),
        },
      });
    };

    let res = await doRequest();

    // Refresh and retry once on 401
    if (res.status === 401) {
      await this.refreshTokens();
      res = await doRequest();
    }

    // Retry once on 429 with Retry-After
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1_000));
      res = await doRequest();
    }

    if (!res.ok) {
      const err = await res.json();
      const error = new Error(err.message ?? 'API error') as Error & { code: string; status: number };
      error.code = err.code;
      error.status = res.status;
      throw error;
    }

    return res.json() as Promise<T>;
  }

  // ── Pagination helper ───────────────────────────────────────────────────────

  async *paginate<T>(
    path: string,
    params: Record<string, string | number> = {},
    pageSize = 20
  ): AsyncGenerator<T[]> {
    let page = 1;
    let totalPages = Infinity;

    while (page <= totalPages) {
      const qs = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        page: String(page),
        limit: String(pageSize),
      });

      const { data, meta } = await this.fetch<{ data: T[]; meta: { totalPages: number } }>(
        `${path}?${qs}`
      );

      yield data;
      totalPages = meta.totalPages;
      page++;
    }
  }

  // ── Patients ────────────────────────────────────────────────────────────────

  patients = {
    list: (params?: { page?: number; limit?: number; q?: string; riskLevel?: string }) =>
      this.fetch('/patients', { method: 'GET' }),

    get: (id: string) =>
      this.fetch(`/patients/${id}`),

    create: (payload: Record<string, unknown>) =>
      this.fetch('/patients', { method: 'POST', body: JSON.stringify(payload) }),

    update: (id: string, payload: Record<string, unknown>) =>
      this.fetch(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

    delete: (id: string) =>
      this.fetch(`/patients/${id}`, { method: 'DELETE' }),

    search: (q: string, page = 1, limit = 20) =>
      this.fetch(`/patients/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`),

    export: (id: string, format: 'csv' | 'pdf' | 'fhir' | 'hl7') =>
      fetch(`${this.config.baseUrl}/patients/${id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }),
  };

  // ── Encounters ──────────────────────────────────────────────────────────────

  encounters = {
    list: (params?: { patientId?: string; page?: number; limit?: number }) =>
      this.fetch('/encounters'),

    get: (id: string) =>
      this.fetch(`/encounters/${id}`),

    create: (payload: Record<string, unknown>) =>
      this.fetch('/encounters', { method: 'POST', body: JSON.stringify(payload) }),

    update: (id: string, payload: Record<string, unknown>) =>
      this.fetch(`/encounters/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

    signOff: (id: string) =>
      this.fetch(`/encounters/${id}/sign-off`, { method: 'POST' }),
  };

  // ── Appointments ────────────────────────────────────────────────────────────

  appointments = {
    list: (params?: { patientId?: string; status?: string }) =>
      this.fetch('/appointments'),

    create: (payload: Record<string, unknown>) =>
      this.fetch('/appointments', { method: 'POST', body: JSON.stringify(payload) }),

    update: (id: string, payload: Record<string, unknown>) =>
      this.fetch(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

    cancel: (id: string) =>
      this.fetch(`/appointments/${id}`, { method: 'DELETE' }),
  };

  // ── Payments ────────────────────────────────────────────────────────────────

  payments = {
    createIntent: (payload: { amount: string; destination: string; assetCode?: string; patientId?: string }) =>
      this.fetch('/payments/intent', { method: 'POST', body: JSON.stringify(payload) }),

    confirm: (intentId: string, txHash: string) =>
      this.fetch(`/payments/${intentId}/confirm`, { method: 'PATCH', body: JSON.stringify({ txHash }) }),

    list: (params?: { page?: number; limit?: number; status?: string }) =>
      this.fetch('/payments'),

    getBalance: () =>
      this.fetch('/payments/balance'),

    getFeeEstimate: () =>
      this.fetch('/payments/fee-estimate'),
  };

  // ── Webhooks ────────────────────────────────────────────────────────────────

  webhooks = {
    list: () =>
      this.fetch('/webhooks'),

    create: (payload: { url: string; events: string[]; description?: string }) =>
      this.fetch('/webhooks', { method: 'POST', body: JSON.stringify(payload) }),

    update: (id: string, payload: Record<string, unknown>) =>
      this.fetch(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    delete: (id: string) =>
      this.fetch(`/webhooks/${id}`, { method: 'DELETE' }),

    deliveries: (id: string) =>
      this.fetch(`/webhooks/${id}/deliveries`),

    retryDelivery: (id: string, deliveryId: string) =>
      this.fetch(`/webhooks/${id}/deliveries/${deliveryId}/retry`, { method: 'POST' }),
  };
}
```

### Usage

```typescript
import { HealthWatchersClient } from './health-watchers-client';

const hw = new HealthWatchersClient({
  baseUrl: 'https://api.healthwatchers.io/api/v1',
  email: process.env.HW_EMAIL!,
  password: process.env.HW_PASSWORD!,
});

// List all patients using the async paginator
for await (const page of hw.paginate('/patients', {}, 50)) {
  for (const patient of page) {
    console.log(patient);
  }
}

// Create a payment intent
const intent = await hw.payments.createIntent({
  amount: '25.0000000',
  destination: 'GCEZ...',
  assetCode: 'XLM',
  patientId: '507f1f77bcf86cd799439011',
});

// Confirm after the user broadcasts the Stellar transaction
await hw.payments.confirm(intent.data.intentId, 'abc123txhash...');
```

---

## Python SDK Pattern

```python
# health_watchers_client.py
import httpx, time, hmac, hashlib
from typing import Generator, Any

class HealthWatchersClient:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.email = email
        self.password = password
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._client = httpx.Client(timeout=30)

    def login(self) -> None:
        res = self._client.post(f"{self.base_url}/auth/login", json={
            "email": self.email,
            "password": self.password,
        })
        res.raise_for_status()
        data = res.json()["data"]
        self._access_token = data["accessToken"]
        self._refresh_token = data["refreshToken"]

    def _refresh(self) -> None:
        res = self._client.post(f"{self.base_url}/auth/refresh", json={
            "refreshToken": self._refresh_token
        })
        if not res.is_success:
            raise RuntimeError("Session expired — please log in again")
        data = res.json()["data"]
        self._access_token = data["accessToken"]
        self._refresh_token = data["refreshToken"]

    def request(self, method: str, path: str, **kwargs) -> Any:
        if not self._access_token:
            self.login()

        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self._access_token}"

        res = self._client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)

        if res.status_code == 401:
            self._refresh()
            headers["Authorization"] = f"Bearer {self._access_token}"
            res = self._client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)

        if res.status_code == 429:
            retry_after = int(res.headers.get("Retry-After", 60))
            time.sleep(retry_after)
            res = self._client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)

        res.raise_for_status()
        return res.json()

    def paginate(self, path: str, page_size: int = 20, **params) -> Generator:
        page = 1
        while True:
            result = self.request("GET", path, params={"page": page, "limit": page_size, **params})
            yield result["data"]
            if page >= result["meta"]["totalPages"]:
                break
            page += 1

    # Webhook signature verification (for your server)
    @staticmethod
    def verify_signature(secret: str, raw_body: bytes, signature: str) -> bool:
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
```

### Python usage

```python
hw = HealthWatchersClient(
    base_url="https://api.healthwatchers.io/api/v1",
    email="admin@clinic.example",
    password="Secure@123!",
)

# Fetch all patients
for page in hw.paginate("/patients", page_size=50):
    for patient in page:
        print(patient["fullName"])

# Create payment intent
intent = hw.request("POST", "/payments/intent", json={
    "amount": "10.0000000",
    "destination": "GCEZ...",
    "assetCode": "XLM",
})
```

---

## cURL Quick Reference

```bash
# Set your base URL and token
BASE="https://api.healthwatchers.io/api/v1"
TOKEN="your-access-token"

# Login
curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@clinic.example","password":"Secure@123!"}' | jq .

# List patients (page 1)
curl -s "$BASE/patients?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create appointment
curl -s -X POST "$BASE/appointments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "507f1f77bcf86cd799439011",
    "scheduledAt": "2025-09-01T09:00:00.000Z",
    "type": "follow-up"
  }' | jq .

# Create payment intent
curl -s -X POST "$BASE/payments/intent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "25.0000000",
    "destination": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB",
    "assetCode": "XLM"
  }' | jq .

# Register webhook
curl -s -X POST "$BASE/webhooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.example/hooks/hw",
    "events": ["payment.confirmed", "patient.created"]
  }' | jq .

# Refresh access token
curl -s -X POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"your-refresh-token"}' | jq .
```

---

## Environment Variables for SDK Clients

```env
HW_BASE_URL=https://api.healthwatchers.io/api/v1
HW_EMAIL=admin@clinic.example
HW_PASSWORD=Secure@123!
HW_WEBHOOK_SECRET=your-webhook-secret-from-registration
```
