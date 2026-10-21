---
title: Stellar Federation
description: "Serves `stellar.toml` and resolves Stellar federation addresses (`name*domain`) to clinic accounts."
---

# Stellar Federation

Serves `stellar.toml` and resolves Stellar federation addresses (`name*domain`) to clinic accounts.

| | |
|---|---|
| **Base path** | `/.well-known, /federation` |
| **Source** | [`apps/api/src/modules/federation/federation.router.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/federation/federation.router.ts) |

## Data model

- Reads `Clinic.federationAddress` and `Clinic.stellarPublicKey`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/.well-known/stellar.toml` | Public |
| `GET` | `/.well-known` | Public |
| `GET` | `/federation/stellar.toml` | Public |
| `GET` | `/federation` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Stellar Integration](/stellar/overview)
