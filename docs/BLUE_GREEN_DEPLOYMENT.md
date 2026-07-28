# Blue-Green Deployment

**Health Watchers — Zero-Downtime API Releases**

## Overview

Blue-green deployment runs two identical production slots (`blue` and `green`)
of the API side by side. Only one slot receives live traffic at a time. A
release rolls the *inactive* slot, verifies it's healthy, then switches the
load-balancing Service to point at it — giving zero-downtime cutover and an
instant rollback path if the new version misbehaves.

This is an alternative to the default rolling-update strategy used by
`k8s/api/deployment.yaml`. Use it for releases that need an instant,
traffic-level rollback (schema-sensitive changes, high-risk releases) rather
than a pod-by-pod rolling restart.

## Components

1. **Blue/Green Deployments** (`k8s/api/blue-green/deployment-blue.yaml`,
   `deployment-green.yaml`) — two independent Deployments, `api-blue` and
   `api-green`, each running the full replica count so either can take 100%
   of traffic.
2. **Switchable Service** (`k8s/api/blue-green/service.yaml`) — `api-service`,
   a ClusterIP Service whose selector includes `version: blue|green`. Flipping
   that label is what moves traffic between slots.
3. **Deployment script** (`ops/blue-green-deployment.sh`) — rolls the inactive
   slot to a new image, waits for it to become healthy, then switches
   `api-service` to it.
4. **Rollback script** (`ops/rollback-deployment.sh`) — flips `api-service`
   back to the previous slot.
5. **Test suites** (`ops/test-blue-green-deployment.sh`,
   `k8s/test-cert-manager.sh` pattern) — validate the slot-selection and
   rollback logic without touching a live cluster.

## One-time Setup

```bash
kubectl apply -f k8s/api/blue-green/
```

By default `api-service` selects `version: blue`, matching the initial state
of `api-blue`. Point the ingress `api` backend paths (`k8s/ingress.yaml`) at
`api-service` instead of `api` to route live traffic through the switchable
Service. Leave the standalone `api` Deployment/Service in place if you also
want the option to fall back to plain rolling updates.

## Releasing

```bash
# Deploy a new image to the inactive slot and switch traffic to it
./ops/blue-green-deployment.sh api ghcr.io/chisom92/health-watchers-api:v2.1 health-watchers
```

Flow:

```
1. Determine active slot (blue or green) from api-service selector
2. Roll the inactive slot to the new image, wait for rollout to finish
3. Verify readyReplicas == desired replicas on the inactive slot
4. Switch api-service selector to the inactive (now-updated) slot
5. Previous slot stays running, unchanged, as an instant rollback target
```

Traffic is never routed to a slot until its rollout has fully completed and
its replicas report ready — there is no window where the Service points at a
partially-updated deployment, so cutover is zero-downtime.

## Rolling Back

```bash
./ops/rollback-deployment.sh api health-watchers
```

This flips `api-service` back to whichever slot was previously active. No
redeploy is required — the old slot's pods were never scaled down, so
rollback is just a Service selector patch and takes effect immediately.

## Testing

```bash
./ops/test-blue-green-deployment.sh
```

Validates slot-selection, health-check, traffic-switch and rollback logic in
isolation (no cluster required).
