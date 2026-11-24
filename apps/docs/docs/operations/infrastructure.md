---
title: Infrastructure Endpoints
description: "Admin-only endpoints for database sharding health and routing, CDN cache invalidation and health, MongoDB replication status and failover testing, and background-job administration."
---

# Infrastructure Endpoints

Admin-only endpoints for database sharding health and routing, CDN cache invalidation and health, MongoDB replication status and failover testing, and background-job administration.

| | |
|---|---|
| **Base path** | `/api/v1/sharding, /api/v1/cdn, /api/v1/replication, /api/v2/admin/jobs` |
| **Source** | [`apps/api/src/routes/sharding.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/sharding.ts)<br/>[`apps/api/src/routes/cdn/cache-invalidation.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/cdn/cache-invalidation.ts)<br/>[`apps/api/src/routes/cdn/cdn-health.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/cdn/cdn-health.ts)<br/>[`apps/api/src/routes/replication.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/routes/replication.ts)<br/>[`apps/api/src/jobs/jobs-admin.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/jobs/jobs-admin.controller.ts) |

## Data model

- No dedicated models

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/sharding/health` | `admin` |
| `POST` | `/api/v1/sharding/health-check` | `admin` |
| `GET` | `/api/v1/sharding/strategy` | `admin` |
| `GET` | `/api/v1/sharding/balance/:collection` | `admin` |
| `GET` | `/api/v1/sharding/route` | `admin` |
| `POST` | `/api/v1/cdn/cache-invalidation` | `admin` |
| `POST` | `/api/v1/cdn/cache-invalidation/bulk` | `admin` |
| `GET` | `/api/v1/cdn/cache-status/:path` | Authenticated |
| `GET` | `/api/v1/cdn/metrics` | `admin` |
| `GET` | `/api/v1/cdn/health` | `admin` |
| `GET` | `/api/v1/cdn/config` | `admin` |
| `POST` | `/api/v1/cdn/test-delivery` | `admin` |
| `GET` | `/api/v1/replication/status` | `admin` |
| `GET` | `/api/v1/replication/lag` | `admin` |
| `GET` | `/api/v1/replication/consistency` | `admin` |
| `POST` | `/api/v1/replication/test-failover` | `admin` |
| `GET` | `/api/v1/replication/read-preferences` | `admin` |
| `GET` | `/api/v1/replication/metrics` | `admin` |
| `GET` | `/api/v2/admin/jobs` | `SUPER_ADMIN` |

## Multi-tenant isolation model

Clinic data is scoped by `clinicId` in the application layer. The infrastructure layer adds defence-in-depth isolation on top of that scoping.

### Clinic namespaces

Each clinic tier is deployed into its own Kubernetes namespace, named `clinic-<clinicId>`. Shared platform components (ingress, monitoring, job runners) live in the `platform` namespace. Namespaces are labelled so that policies and tooling can select them:

```yaml
metadata:
  labels:
    app.kubernetes.io/part-of: health-watchers
    health-watchers.io/tenant: clinic-<clinicId>
    health-watchers.io/tier: <tier>
```

### NetworkPolicy resources

Cross-namespace traffic is denied by default. The manifests live in `infra/k8s/network-policies/`:

| Policy | Namespace | Effect |
|--------|-----------|--------|
| `default-deny-ingress` | each `clinic-*` | Denies all ingress not explicitly allowed |
| `default-deny-egress` | each `clinic-*` | Denies all egress not explicitly allowed |
| `allow-intra-namespace` | each `clinic-*` | Allows pod-to-pod traffic within the same clinic namespace only |
| `allow-platform-ingress` | each `clinic-*` | Allows ingress from the `platform` namespace (ingress controller, monitoring) |
| `allow-dns-egress` | each `clinic-*` | Allows egress to cluster DNS |
| `allow-datastore-egress` | each `clinic-*` | Allows egress only to the clinic's own database service and cache |

Because `allow-intra-namespace` selects pods by the namespace's `health-watchers.io/tenant` label, a pod in `clinic-a` cannot open a connection to a pod in `clinic-b`; the connection is dropped by the egress policy of the source namespace and again by the ingress policy of the destination namespace.

### Database users per clinic tier

Each clinic tier gets dedicated database credentials, provisioned by the migration/ops tooling:

| User | Tier | Grants |
|------|------|--------|
| `hw_<clinicId>_rw` | read/write tier | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the clinic's own collections/rows only |
| `hw_<clinicId>_ro` | read-only tier | `SELECT` on the clinic's own collections/rows only |
| `hw_platform_admin` | platform | Administrative access; never handed to clinic workloads |

Clinic users are granted access through per-clinic views or row-level security policies keyed on `clinicId`, so a query issued with `hw_<clinicId>_rw` cannot read or write another clinic's records even if the application-layer filter is bypassed. Credentials are stored in a per-namespace `Secret` and are not shared between namespaces.

### Penetration test scenario

The isolation guarantees are verified by an automated pen-test scenario (`tests/security/tenant-isolation.spec.ts`):

1. Authenticate as a user belonging to clinic A.
2. Attempt to read, update, and delete records owned by clinic B through the public API, using both the caller's own token and forged `clinicId` parameters/headers.
3. Attempt a direct network connection from a pod in `clinic-a` to the database service and to an application pod in `clinic-b`.
4. Attempt a direct database query using clinic A's credentials against clinic B's data.

The scenario passes only if every attempt is rejected (HTTP `403`/`404` at the API layer, connection timeout at the network layer, and permission/empty-result at the database layer). Any successful cross-tenant access fails the build.

## Roles

Roles referenced by this module: `SUPER_ADMIN`, `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
