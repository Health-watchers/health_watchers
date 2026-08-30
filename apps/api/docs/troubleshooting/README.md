# Health Watchers API — Troubleshooting Documentation

Comprehensive reference for diagnosing and resolving issues in the Health Watchers API.

## Contents

| Document | What it covers |
|---|---|
| [error-codes.md](./error-codes.md) | Full API error code reference with HTTP status, cause, and fix |
| [common-errors.md](./common-errors.md) | 50+ common runtime errors with step-by-step solutions |
| [debugging-procedures.md](./debugging-procedures.md) | Structured debugging workflows for every major subsystem |
| [performance-issues.md](./performance-issues.md) | Slow queries, high latency, memory leaks, connection pool exhaustion |
| [deployment-troubleshooting.md](./deployment-troubleshooting.md) | Docker, CI/CD, startup failures, and environment issues |
| [database-troubleshooting.md](./database-troubleshooting.md) | MongoDB connection, replication, sharding, migration failures |
| [authentication-issues.md](./authentication-issues.md) | JWT, MFA, account lockout, session, and RBAC problems |
| [payment-issues.md](./payment-issues.md) | Stellar transactions, disputes, refunds, and reconciliation |
| [migration-troubleshooting.md](./migration-troubleshooting.md) | Data migrations, rollbacks, index failures, and schema changes |
| [faq.md](./faq.md) | Frequently asked questions from developers and operators |

## Quick Reference: Common Symptoms

| Symptom | Go to |
|---|---|
| Server won't start | [deployment-troubleshooting.md §Startup Failures](./deployment-troubleshooting.md#startup-failures) |
| `401 Unauthorized` on every request | [authentication-issues.md §JWT Errors](./authentication-issues.md#jwt-errors) |
| `429 Too Many Requests` | [common-errors.md #ERR-029](./common-errors.md#err-029-too-many-requests) |
| `503` / DB not ready | [database-troubleshooting.md §Connection Failures](./database-troubleshooting.md#connection-failures) |
| Slow API responses (>1 s) | [performance-issues.md §Slow Queries](./performance-issues.md#slow-queries) |
| Migration stuck or failed | [migration-troubleshooting.md §Stuck Migrations](./migration-troubleshooting.md#stuck-migrations) |
| Payment not confirmed | [payment-issues.md §Unconfirmed Transactions](./payment-issues.md#unconfirmed-transactions) |
| MFA code rejected | [authentication-issues.md §MFA Issues](./authentication-issues.md#mfa-issues) |
| Memory usage growing | [performance-issues.md §Memory Leaks](./performance-issues.md#memory-leaks) |
| HIPAA compliance warning at startup | [deployment-troubleshooting.md §HIPAA Warnings](./deployment-troubleshooting.md#hipaa-compliance-warnings) |

## First Responder Checklist

When an incident is reported, run through this before opening a deep dive:

1. Check `GET /health/ready` — confirms DB + Redis connectivity.
2. Check `GET /health/live` — confirms the process is alive.
3. Check `GET /metrics` — look at `http_request_duration_seconds` p99 and `mongodb_connection_pool_size`.
4. Search Sentry for the `requestId` from the error response.
5. Grep the Pino log stream: `jq 'select(.requestId == "<id>")' app.log`
6. Check rate-limit headers: `RateLimit-Remaining` / `Retry-After` on the failing request.

## Environment Quick Check

```bash
# Verify env validation passes (exits 1 if anything is wrong)
NODE_ENV=production node -e "require('./dist/config/env')"

# Check DB connectivity
mongosh "$MONGO_URI" --eval "db.adminCommand({ ping: 1 })"

# Check Redis
redis-cli -u "$REDIS_URL" PING

# Check Stellar Horizon
curl https://horizon-testnet.stellar.org/
```

## Log Format

All logs are structured JSON (Pino). Key fields:

```json
{
  "level": "error",
  "time": 1722000000000,
  "requestId": "abc-123",
  "userId": "...",
  "clinicId": "...",
  "method": "POST",
  "path": "/api/v2/payments",
  "err": { "message": "...", "stack": "..." }
}
```

Filter logs by severity: `jq 'select(.level >= 50)' app.log` (50 = error, 40 = warn, 30 = info).
