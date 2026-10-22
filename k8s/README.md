# Kubernetes Deployment — Health Watchers

This directory contains Kubernetes manifests and a Helm chart for deploying Health Watchers to a Kubernetes cluster.

## Directory Structure

```
k8s/
├── namespace.yaml              # Namespace: health-watchers
├── configmap.yaml              # Non-secret environment config
├── secrets.yaml                # Kubernetes Secrets (placeholder values)
├── external-secrets.yaml       # External Secrets Operator integration
├── ingress.yaml                # Ingress with TLS (cert-manager)
├── network-policies.yaml       # NetworkPolicy resources (default-deny + per-service rules)
├── service-accounts.yaml       # Per-component ServiceAccounts + least-privilege RBAC
├── storage/
│   └── persistent-volume-claims.yaml  # PVCs: standalone MongoDB, Redis, backups
├── logging/
│   ├── fluent-bit-sidecar.yaml        # Fluent Bit sidecar ConfigMap
│   └── logging-sidecar-patch.yaml     # Strategic-merge patch to add the sidecar
├── DISASTER_RECOVERY.md        # DR runbook (RTO/RPO, restore + failover procedures)
├── api/
│   ├── deployment.yaml         # API Deployment (2 replicas)
│   ├── service.yaml            # API ClusterIP Service
│   ├── hpa.yaml                # HorizontalPodAutoscaler (2–10 replicas)
│   └── pdb.yaml                # PodDisruptionBudget (minAvailable: 1)
├── redis/
│   ├── deployment.yaml         # In-cluster Redis (AOF persistence, 1 replica)
│   └── service.yaml            # Redis ClusterIP Service
├── web/
│   ├── deployment.yaml         # Web Deployment (2 replicas)
│   ├── service.yaml            # Web ClusterIP Service
│   ├── hpa.yaml                # HorizontalPodAutoscaler (2–8 replicas)
│   └── pdb.yaml                # PodDisruptionBudget (minAvailable: 1)
└── stellar-service/
    ├── deployment.yaml         # Stellar Service Deployment (2 replicas)
    ├── service.yaml            # Stellar Service ClusterIP Service
    ├── hpa.yaml                # HorizontalPodAutoscaler (2–10 replicas)
    └── pdb.yaml                # PodDisruptionBudget (minAvailable: 1)

helm/health-watchers/           # Helm chart (see helm/README.md)
```

## Prerequisites

- Kubernetes 1.25+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configured for your cluster
- [cert-manager](https://cert-manager.io/docs/installation/) installed (for TLS)
- [nginx ingress controller](https://kubernetes.github.io/ingress-nginx/deploy/) installed
- (Production) [External Secrets Operator](https://external-secrets.io/latest/introduction/getting-started/) installed

## Quick Start (Raw Manifests)

### 1. Configure Secrets

Edit `k8s/secrets.yaml` and replace all `<base64-encoded-*>` placeholders:

```bash
# Encode a value
echo -n "your-mongo-uri" | base64
```

> **Never commit real secret values to git.** For production, use the External Secrets Operator instead (see `k8s/external-secrets.yaml`).

### 2. Update Domain

Replace `app.healthwatchers.example.com` in `k8s/ingress.yaml` and `k8s/configmap.yaml` with your actual domain.

### 3. Update Image Tags

Replace `latest` image tags in each deployment with specific version tags for production deployments.

### 4. Apply Manifests

```bash
# Create namespace first
kubectl apply -f k8s/namespace.yaml

# Apply config and secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# Storage, RBAC and the data tier
kubectl apply -f k8s/service-accounts.yaml
kubectl apply -f k8s/storage/persistent-volume-claims.yaml
kubectl apply -f k8s/redis/

# Deploy services
kubectl apply -f k8s/api/
kubectl apply -f k8s/web/
kubectl apply -f k8s/stellar-service/

# Apply ingress + network policies
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policies.yaml

# Optional: centralised logging sidecar
kubectl apply -f k8s/logging/fluent-bit-sidecar.yaml
```

### 5. Verify Deployment

```bash
kubectl get pods -n health-watchers
kubectl get services -n health-watchers
kubectl get ingress -n health-watchers
kubectl get hpa -n health-watchers
```

## Resource Limits

| Service         | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------------|-------------|-----------|----------------|--------------|
| API             | 125m        | 250m      | 128Mi          | 256Mi        |
| Web             | 250m        | 500m      | 256Mi          | 512Mi        |
| Stellar Service | 50m         | 100m      | 64Mi           | 128Mi        |

## Autoscaling

The API, Web and Stellar Service each have a HorizontalPodAutoscaler configured:

| Service         | Min | Max | CPU trigger | Memory trigger | Custom metric                        |
|-----------------|-----|-----|-------------|----------------|--------------------------------------|
| API             | 2   | 10  | > 70%       | > 80%          | —                                    |
| Web             | 2   | 8   | > 70%       | > 80%          | —                                    |
| Stellar Service | 2   | 10  | > 70%       | > 80%          | `stellar_payment_queue_depth` > 10   |

Scale-up is stabilized over 60 s (max +2 pods/min); scale-down over 5 minutes (max -1 pod/min) to prevent flapping.

### Stellar Service custom metric

The `stellar_payment_queue_depth` Prometheus gauge is exposed by the stellar-service on `/metrics`. To use it as an HPA trigger you need the [Prometheus Adapter](https://github.com/kubernetes-sigs/prometheus-adapter) installed and configured to expose `stellar_payment_queue_depth` as a custom metrics API resource.

```bash
# Install Prometheus Adapter (example with Helm)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --set prometheus.url=http://prometheus.monitoring.svc \
  --set rules.custom[0].seriesQuery='stellar_payment_queue_depth' \
  --set rules.custom[0].resources.overrides.namespace.resource=namespace \
  --set rules.custom[0].resources.overrides.pod.resource=pod \
  --set rules.custom[0].name.matches='stellar_payment_queue_depth' \
  --set rules.custom[0].metricsQuery='avg(<<.Series>>{<<.LabelMatchers>>})'
```

## Pod Disruption Budgets

Each service has a PodDisruptionBudget that guarantees at least 1 replica remains available during voluntary disruptions (node drains, cluster upgrades, rolling restarts).

| Service         | minAvailable | File                            |
|-----------------|--------------|---------------------------------|
| API             | 1            | `k8s/api/pdb.yaml`              |
| Web             | 1            | `k8s/web/pdb.yaml`              |
| Stellar Service | 1            | `k8s/stellar-service/pdb.yaml`  |

All deployments run with 2 replicas by default, so `minAvailable: 1` allows Kubernetes to evict one pod at a time while keeping the service live.

### Verify PDBs

```bash
kubectl get pdb -n health-watchers
```

Expected output:

```
NAME              MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
api               1               N/A               1                     ...
stellar-service   1               N/A               1                     ...
web               1               N/A               1                     ...
```

### Simulate a node drain

```bash
# Cordon and drain a node — Kubernetes will respect the PDB and keep 1 pod running
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Watch pods reschedule in real time
kubectl get pods -n health-watchers -w

# Uncordon when done
kubectl uncordon <node-name>
```

If the drain would violate a PDB (e.g. only 1 replica is running), `kubectl drain` will block until a replacement pod becomes ready, preventing downtime.

### Helm chart

PDBs are controlled per-service in `values.yaml`:

```yaml
api:
  pdb:
    enabled: true
    minAvailable: 1

web:
  pdb:
    enabled: true
    minAvailable: 1

stellarService:
  pdb:
    enabled: true
    minAvailable: 1
```

Set `pdb.enabled: false` to disable a PDB for a specific service (e.g. in a single-node dev cluster where disruption budgets would block drains).

## Health Probes

| Service         | Liveness          | Readiness         | Startup           |
|-----------------|-------------------|-------------------|-------------------|
| API             | GET /health/live  | GET /health/ready | —                 |
| Web             | GET /             | GET /             | —                 |
| Stellar Service | GET /health/live  | GET /health/ready | GET /health/live  |

### Liveness vs Readiness vs Startup

Kubernetes runs three kinds of probes, and they answer different questions:

| Probe       | Question it answers                              | On failure                                          |
|-------------|--------------------------------------------------|-----------------------------------------------------|
| `liveness`  | Is the process still healthy, or wedged?         | kubelet **restarts** the container                  |
| `readiness` | Can this pod serve traffic *right now*?          | Pod is **removed from Service endpoints** (no restart) |
| `startup`   | Has the process finished initialising?           | kubelet **restarts** the container after `failureThreshold` |

Key rules:

- **Liveness must not depend on downstream services.** If `/health/live` checked MongoDB and Mongo was briefly down, every API pod would be restarted in a crash loop — making an outage worse. Liveness should only prove the process is responsive.
- **Readiness should check dependencies** the pod needs to serve requests (DB connection, cache, migrations applied). A failing readiness probe drains traffic from the pod without killing it, so it recovers automatically when the dependency returns.
- **Startup probes** protect slow-starting containers. While a startup probe is running, liveness and readiness probes are disabled, so a slow boot is not mistaken for a crash. Use them for services with long initialisation (e.g. stellar-service warming Horizon connections, or API pods running migrations).

### Why `/health` is suitable as a liveness probe

The API's `/health` endpoint is a lightweight, dependency-free check: it returns `200 OK` as long as the HTTP server is accepting requests. It does **not** touch MongoDB, Redis or Stellar Horizon, so a transient dependency failure cannot trigger a restart storm. That makes it a correct liveness probe.

### Readiness endpoint (`/ready`)

The API exposes a separate `/ready` endpoint that verifies **database connectivity** (a `ping` against MongoDB, with a short timeout). It returns:

- `200 OK` when the DB connection is healthy — the pod stays in the Service endpoints.
- `503 Service Unavailable` when the DB is unreachable — the pod is removed from endpoints until it recovers.

Because readiness failures only remove the pod from load balancing, a MongoDB blip drains traffic gracefully instead of restarting pods.

Example API probe configuration:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Startup probes for slow services

Services with slow initialisation (stellar-service connecting to Horizon, API running migrations) should use a startup probe so liveness checks don't fire during boot:

```yaml
# k8s/stellar-service/deployment.yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 3002
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 24   # allow up to 2 minutes to start
livenessProbe:
  httpGet:
    path: /health/live
    port: 3002
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3002
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

Tune `failureThreshold × periodSeconds` to comfortably exceed the worst-case boot time, but keep it as low as practical so a genuinely broken pod is restarted promptly.

### Testing probe behaviour during a rolling deployment

Rolling updates use `maxUnavailable: 0` / `maxSurge: 1`, so a new pod must pass its readiness probe before an old pod is terminated. To verify probes behave correctly:

```bash
# Watch the rollout progress — it blocks until all new pods are Ready
kubectl rollout status deployment/api -n health-watchers

# In another terminal, watch endpoints shrink/grow as pods become ready
kubectl get endpoints api -n health-watchers -w

# Watch pod readiness transitions
kubectl get pods -n health-watchers -l app=api -w
```

To prove readiness gating works, break the dependency temporarily (e.g. scale MongoDB to 0 in a dev cluster) and confirm the API pods go `0/1 Ready` and are removed from endpoints **without restarting** (`RESTARTS` count stays constant). Restore the dependency and confirm they return to `1/1 Ready`.

## Secrets Rotation

`k8s/secret-rotation-lambda.py` and `k8s/secret-rotation-config.yaml` implement automated rotation of the secrets the platform depends on. This section is the operator runbook.

### What gets rotated

| Secret                    | Kubernetes Secret / key                         | Recommended interval | Notes |
|---------------------------|-------------------------------------------------|----------------------|-------|
| JWT signing secret        | `health-watchers-secrets` / `JWT_SECRET`        | 90 days              | Old secret must remain valid during overlap so existing tokens keep working |
| Stellar keypair (secret)  | `health-watchers-secrets` / `STELLAR_SECRET_KEY`| 180 days             | Rotate the signing keypair; the public key is updated in config |
| MongoDB credentials       | `health-watchers-secrets` / `MONGO_URI`         | 90 days              | Create the new DB user first, then switch the URI, then remove the old user |

Rotation intervals are configured in `k8s/secret-rotation-config.yaml` (`rotationIntervals`), along with the Lambda's schedule and the notification targets.

### Rotation flow

1. **Trigger** — either the EventBridge schedule in `secret-rotation-config.yaml`, the GitHub Actions workflow (manual, with approval), or a manual `rotate-secret.sh` run.
2. **Generate** — the Lambda generates a new secret value (random JWT secret, new Stellar keypair, or new MongoDB user + password).
3. **Write new version** — the new value is written to AWS Secrets Manager as a **new version**, leaving the previous version available.
4. **Overlap window** — for the overlap period (default 24 h, `overlapHours` in the config) both old and new versions are valid. The API accepts JWTs signed with either secret during this window.
5. **Rolling restart** — the affected Deployment is rolled with `maxUnavailable: 0` so pods pick up the new secret without dropping traffic.
6. **Retire old version** — after the overlap window the previous version is disabled and, once no traffic uses it, deleted.

### Zero-downtime rotation procedure

The API is designed to handle rotation without downtime:

- **JWT secrets**: the API validates tokens against the *current* and *previous* secret during the overlap window, so in-flight sessions are not invalidated. New tokens are signed with the current secret.
- **Stellar keypairs**: the new keypair is published to config before the old one is retired; the stellar-service reloads it on restart.
- **MongoDB credentials**: the new user is created and granted the same roles *before* the URI is switched; the old user is dropped only after the overlap window.

Rolling restart with zero unavailability:

```bash
# The deployments use maxUnavailable: 0 / maxSurge: 1, so a new pod must be
# Ready before an old one is terminated.
kubectl rollout restart deployment/api -n health-watchers
kubectl rollout status deployment/api -n health-watchers

# Verify pods picked up the new secret version
kubectl get pods -n health-watchers -l app=api -o jsonpath='{.items[*].metadata.annotations}'
```

If a rotation goes wrong, roll back by re-activating the previous secret version in AWS Secrets Manager and restarting the deployment — the previous version is still valid until the overlap window ends.

### Testing the Lambda locally

You can invoke the rotation Lambda locally against a dev AWS account to validate changes before deploying:

```bash
# Package the function (if not already built)
zip -j secret-rotation.zip k8s/secret-rotation-lambda.py

# Invoke with a test payload (dry-run mode recommended for local testing)
aws lambda invoke \
  --function-name health-watchers-secret-rotation \
  --payload '{"secretType":"jwt","dryRun":true}' \
  --cli-binary-format raw-in-base64-out \
  response.json

cat response.json
```

Use `"dryRun": true` to exercise the generation and validation path without writing new secret versions. Test each `secretType` (`jwt`, `stellar`, `mongodb`) and confirm the response reports the intended action.

### GitHub Actions manual rotation

`.github/workflows/secret-rotation.yml` provides a manually triggered rotation with an approval gate:

- Triggered via **Actions → Secret Rotation → Run workflow** (`workflow_dispatch`), choosing the secret type and environment.
- The job targets a GitHub **Environment** (e.g. `production`) configured with **required reviewers**, so the run pauses until an approver signs off.
- It assumes an AWS role via OIDC (no long-lived keys), invokes the Lambda, and waits for the rolling restart to complete.

To require approval, configure the environment under **Settings → Environments → production → Required reviewers**. Without an approver the workflow will not proceed to the rotation step.

### Prometheus alerts for upcoming rotations

The rotation Lambda exports `secret_rotation_due_timestamp_seconds` (per secret). Alert rules fire as the rotation date approaches:

```yaml
groups:
  - name: secret-rotation
    rules:
      - alert: SecretRotationDueSoon
        expr: (secret_rotation_due_timestamp_seconds - time()) < 14 * 24 * 3600
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Secret {{ $labels.secret }} rotates in under 14 days"
      - alert: SecretRotationOverdue
        expr: secret_rotation_due_timestamp_seconds < time()
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Secret {{ $labels.secret }} is past its rotation date"
```

## TLS / Ingress

TLS is terminated at the Ingress using cert-manager with Let's Encrypt. Path routing:

| Path      | Backend         |
|-----------|-----------------|
| `/api`    | api:3001        |
| `/health` | api:3001        |
| `/stellar`| stellar-service:3002 |
| `/`       | web:3000        |

## Production: External Secrets Operator

For production, use ESO instead of inline secrets:

```bash
# Install ESO
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

# Configure your SecretStore (AWS, Vault, GCP, etc.)
# Then apply the ExternalSecret manifest
kubectl apply -f k8s/external-secrets.yaml
```

## Network Topology and Policies

`k8s/network-policies.yaml` enforces a least-privilege network model for the `health-watchers` namespace.

### Allowed traffic

```
Ingress controller ──► web (3000)
Ingress controller ──► api  (3001)
web                ──► api  (3001)
api                ──► stellar-service (3002)
api                ──► mongodb         (27017)
api                ──► redis           (6379)
api                ──► external HTTPS  (443)  — Stellar Horizon, Gemini AI, etc.
api                ──► external SMTP   (587 / 2525)
stellar-service    ──► external HTTPS  (443)  — Stellar Horizon / Friendbot
all pods           ──► kube-dns        (53 UDP/TCP)
```

### Denied traffic (blocked by default-deny-all)

| Source          | Destination      | Reason                                      |
|-----------------|------------------|---------------------------------------------|
| web             | stellar-service  | Must go through API auth layer              |
| web             | mongodb          | Direct DB access not permitted              |
| web             | redis            | Direct cache access not permitted           |
| stellar-service | mongodb          | No DB access needed                         |
| stellar-service | redis            | No cache access needed                      |

### Applying network policies

```bash
kubectl apply -f k8s/network-policies.yaml
# Verify
kubectl get networkpolicies -n health-watchers
```

### Helm chart

Network policies are controlled in `values.yaml` (see `helm/health-watchers/templates/network-policies.yaml`). To disable (e.g. in a local dev cluster without a CNI that enforces NetworkPolicy):

```yaml
networkPolicies:
  enabled: false
```

## Persistent Storage

`storage/persistent-volume-claims.yaml` defines PVCs for the single-node
MongoDB Deployment (`standalone-mongodb-data`), Redis (`redis-data`) and a
shared `backups` volume (ReadWriteMany). The production MongoDB replica set
(`mongodb-replica-set-statefulset.yaml`) provisions its own PVCs through
`volumeClaimTemplates` and ignores these. Set `storageClassName` to a class that
exists in your cluster before applying.

## Service Accounts & RBAC

`rbac.yaml` keeps the original shared `health-watchers` ServiceAccount.
`service-accounts.yaml` adds least-privilege per-component accounts — `api` gets
read-only access to ConfigMaps/Secrets/Endpoints; `web`, `stellar-service` and
`redis` run with `automountServiceAccountToken: false` (no Kubernetes API access
at all). Point each Deployment's `serviceAccountName` at its component account.

## Centralised Logging

`logging/fluent-bit-sidecar.yaml` (ConfigMap) plus
`logging/logging-sidecar-patch.yaml` (strategic-merge patch) add a Fluent Bit
sidecar that tails JSON logs from a shared `emptyDir` and ships them to
Elasticsearch/Loki. Set `LOG_FILE=/var/log/app/app.log` in the ConfigMap so the
app writes to the shared volume in addition to stdout.

## Disaster Recovery

See [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) for RTO/RPO targets, backup
inventory, and step-by-step restore / region-failover procedures. Run the DR
test in that document quarterly.

## Helm Chart

See [`helm/health-watchers/`](../helm/health-watchers/) for the Helm chart with full environment support.
