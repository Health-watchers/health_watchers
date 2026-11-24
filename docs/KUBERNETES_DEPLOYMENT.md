# Kubernetes Deployment Configuration

This document provides comprehensive information about deploying Health Watchers to Kubernetes clusters.

## Overview

The Health Watchers application is deployed as a microservices architecture on Kubernetes with:

- **API Service**: Node.js Express-based REST API
- **Stellar Service**: Blockchain integration service
- **Web Frontend**: Next.js React application
- **MongoDB**: Document database with StatefulSet

## Directory Structure

```
k8s/
├── namespace.yaml              # Kubernetes namespace definition
├── configmap.yaml              # Application configuration
├── secrets.yaml                # Sensitive configuration (encrypted)
├── rbac.yaml                   # Service accounts and permissions
├── network-policies.yaml       # Network access rules
├── external-secrets.yaml       # External secret management
├── ingress.yaml                # Ingress routing configuration
├── monitoring.yaml             # Prometheus ServiceMonitors
├── cert-manager-setup.yaml     # cert-manager, Issuers, Certificates, alerts
├── test-cert-manager.sh        # cert-manager verification & renewal test script
│
├── api/
│   ├── deployment.yaml         # API deployment specification
│   ├── service.yaml            # API service
│   ├── hpa.yaml                # Horizontal Pod Autoscaler
│   └── pdb.yaml                # Pod Disruption Budget
│
├── stellar-service/
│   ├── deployment.yaml         # Stellar Service deployment
│   ├── service.yaml            # Stellar Service
│   ├── hpa.yaml                # Horizontal Pod Autoscaler
│   └── pdb.yaml                # Pod Disruption Budget
│
└── web/
    ├── deployment.yaml         # Web frontend deployment
    ├── service.yaml            # Web service
    ├── hpa.yaml                # Horizontal Pod Autoscaler
    └── pdb.yaml                # Pod Disruption Budget
```

## Deployment Configuration

### Namespaces

All resources are deployed in the `health-watchers` namespace for isolation and resource management.

```bash
kubectl apply -f k8s/namespace.yaml
```

### Service Accounts and RBAC

ServiceAccounts, Roles, and RoleBindings are defined for proper access control:

```bash
kubectl apply -f k8s/rbac.yaml
```

Permissions include:
- Reading ConfigMaps and Secrets
- Service discovery
- Pod introspection

### ConfigMap and Secrets

Configuration and sensitive data are managed through:

1. **ConfigMap**: Non-sensitive configuration
   ```bash
   kubectl apply -f k8s/configmap.yaml
   ```

2. **Secrets**: Sensitive data (encrypted at rest)
   ```bash
   kubectl apply -f k8s/secrets.yaml
   ```

### Deployments

Each service has a deployment with:

- **Replicas**: Minimum 2 for high availability
- **Rolling Updates**: Zero-downtime deployments
- **Resource Limits**: CPU and memory constraints
- **Health Checks**: Liveness, readiness, and startup probes
- **Security Context**: Non-root user, dropped capabilities

#### Health Checks

Three types of health checks are implemented:

1. **Startup Probe**: Checks if application has started
   - Gives application time to initialize
   - Example: 30 seconds with 5-second intervals

2. **Readiness Probe**: Checks if application can accept traffic
   - Verifies dependencies are available
   - Example: 10-second initial delay

3. **Liveness Probe**: Checks if application is still running
   - Restarts container if checks fail
   - Example: 15-20 second intervals

### Services

ClusterIP services provide internal networking:

- **API Service**: Port 3001
- **Stellar Service**: Port 3002
- **Web Service**: Port 3000

Services enable:
- Internal service discovery
- Load balancing across pods
- Network isolation

### Horizontal Pod Autoscaling

HPA automatically scales deployments based on metrics:

**API Service:**
- Min replicas: 2
- Max replicas: 5
- CPU threshold: 70%
- Memory threshold: 80%

**Stellar Service:**
- Min replicas: 2
- Max replicas: 5
- CPU threshold: 70%
- Memory threshold: 80%

**Web Service:**
- Min replicas: 2
- Max replicas: 8
- CPU threshold: 75%
- Memory threshold: 80%

Scale-up happens quickly (30s stabilization), scale-down takes longer (300s) to avoid flapping.

### Pod Disruption Budgets

PDBs ensure application availability during:
- Node maintenance
- Cluster upgrades
- Pod evictions

Configuration:
- API: max 1 pod unavailable (2 replicas min)
- Stellar: max 1 pod unavailable (2 replicas min)
- Web: max 1 pod unavailable (2 replicas min)

### Ingress Configuration

Ingress manages external HTTP(S) access:

- **Domain**: `app.healthwatchers.example.com`
- **TLS**: Certificate managed by cert-manager
- **Routing**:
  - `/api/*` → API Service
  - `/health/*` → API Service (health checks)
  - `/stellar/*` → Stellar Service
  - `/` → Web Service (catch-all)

Security headers are automatically added:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera, microphone, geolocation disabled

### Certificate Management (cert-manager)

TLS certificates are issued and renewed automatically by
[cert-manager](https://cert-manager.io/) using Let's Encrypt (ACME v02). The
manifests live in `k8s/cert-manager-setup.yaml`.

**Prerequisite:** install cert-manager and its CRDs in the cluster:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

**Issuer** — `letsencrypt-prod` (namespace `health-watchers`):

- ACME server: `https://acme-v02.api.letsencrypt.org/directory`
- Solver: `http01` via ingress class `nginx`

**Certificate** — `health-watchers-cert`:

| Field | Value |
| --- | --- |
| `secretName` | `health-watchers-tls` |
| `dnsNames` | `api.healthwatchers.com`, `healthwatchers.com`, `www.healthwatchers.com` |
| `issuerRef` | `letsencrypt-prod` |
| `renewBefore` | `720h` (renews 30 days before expiry) |

The Ingress references the issuer via the
`cert-manager.io/cluster-issuer: letsencrypt-prod` annotation, so cert-manager
creates and refreshes the `health-watchers-tls` secret automatically.

**Verify:**

```bash
kubectl get certificate -n health-watchers
kubectl describe certificate health-watchers-cert -n health-watchers
kubectl get secret health-watchers-tls -n health-watchers \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates
```

**Expiry alerts** — the `cert-expiry-alerts` PrometheusRule fires
`CertificateExpiry30Days` (warning), `CertificateExpirySoon` (7 days, warning)
and `CertificateExpiryImmediate` (24 hours, critical). The docker-compose
monitoring stack mirrors these in `monitoring/alerts-certificates.yml`.

**Renewal failure:** see
[`monitoring/runbooks/CERTIFICATE_RENEWAL.md`](../monitoring/runbooks/CERTIFICATE_RENEWAL.md).

### Network Policies

NetworkPolicies control traffic flow:
- Restrict pod-to-pod communication
- Allow ingress traffic only from ingress controller
- Deny by default, allow explicitly

### Monitoring

ServiceMonitors integrate with Prometheus:

- **Endpoints**: `/metrics` on each service
- **Scrape interval**: 30 seconds
- **Timeout**: 10 seconds

### TLS Certificates with cert-manager

TLS certificates for the ingress are issued and renewed automatically by
[cert-manager](https://cert-manager.io/). All cert-manager resources live in
`k8s/cert-manager-setup.yaml`.

#### Architecture

- **cert-manager controller**: Watches `Certificate` resources and drives the
  issuance/renewal lifecycle. Installed into the `cert-manager` namespace
  (typically via Helm or the upstream static manifests).
- **CRDs**: `Issuer`, `ClusterIssuer`, `Certificate`, `CertificateRequest`,
  `Order`, `Challenge` (ACME-specific).
- **Issuers / ClusterIssuers**: Define *how* certificates are obtained.
  - `ClusterIssuer` is cluster-scoped and reusable across namespaces (used here).
  - `Issuer` is namespace-scoped.
  - We define two ACME issuers backed by Let's Encrypt:
    - `letsencrypt-staging` — staging endpoint, untrusted certs, no rate limits.
    - `letsencrypt-prod` — production endpoint, trusted certs, rate limited.

#### Let's Encrypt staging vs production

| Issuer | ACME server | Trusted by browsers | Rate limits | Use for |
|--------|-------------|---------------------|-------------|---------|
| `letsencrypt-staging` | `acme-staging-v02.api.letsencrypt.org` | No | Lenient | Testing, CI, renewal drills |
| `letsencrypt-prod` | `acme-v02.api.letsencrypt.org` | Yes | Strict | Production |

Always validate changes against staging first. Production has strict rate
limits (e.g. 5 duplicate certificates per week) — repeated failed attempts can
lock you out for a week.

**AWS ACM alternative:** If the cluster is on AWS and TLS terminates at an ALB
or CloudFront, you may instead use AWS Certificate Manager. In that case the
ingress uses the ALB's ACM certificate ARN (via the AWS Load Balancer
Controller annotation `service.beta.kubernetes.io/aws-load-balancer-ssl-cert`)
and cert-manager is not required for that ingress. ACM handles renewal
automatically. The Prometheus expiry alerts below still apply if you export ACM
certificate metrics; otherwise rely on ACM's managed renewal and AWS Health
notifications.

#### Certificate resources and renewal

The `Certificate` resources (e.g. `health-watchers-tls`) reference the
production `ClusterIssuer` and specify:

- **secretName**: `health-watchers-tls` — consumed by the ingress.
- **dnsNames**: `app.healthwatchers.example.com`.
- **renewBefore**: `720h` (30 days). cert-manager begins renewal 30 days before
  expiry, retrying with backoff until it succeeds. Renewal is attempted well
  before expiry so transient failures do not cause an outage.

Renewal flow: cert-manager detects the certificate is within `renewBefore` of
expiry → creates a new `CertificateRequest` → ACME `Order` → `Challenge`
(HTTP01 via ingress) → on success, updates the TLS secret → ingress controller
picks up the new secret automatically.

#### Prometheus alerts

`k8s/cert-manager-setup.yaml` includes a `PrometheusRule` with:

- **`CertificateExpiringSoon`**: fires when any certificate expires within
  **30 days** (`certmanager_certificate_expiration_timestamp_seconds - time() <
  30 * 24 * 3600`). Warning severity.
- **`CertificateNotReady`**: fires when a `Certificate` has not been `Ready`
  for 15 minutes (`certmanager_certificate_ready_status{condition="False"} == 1`).
  Critical severity — indicates issuance/renewal is failing.

Ensure the Prometheus operator is configured to select this rule (labels match
your `ruleSelector`).

#### Testing with `k8s/test-cert-manager.sh`

The script verifies the cert-manager installation and exercises the renewal
path:

```bash
# Verify cert-manager, issuers, and certificate status
./k8s/test-cert-manager.sh

# Run the staging short-validity renewal test
./k8s/test-cert-manager.sh --renewal-test
```

The **renewal test** creates a temporary `Certificate` against the staging
issuer with a short `duration` (e.g. `24h`) and a `renewBefore` close to it, so
cert-manager renews almost immediately. The script then waits for the
certificate to become `Ready`, confirms a renewal occurred (secret updated /
new `CertificateRequest`), and cleans up the temporary resources. Run this in a
**staging environment only** — never against production issuers.

#### Runbook: certificate renewal failure

**Symptoms**
- `CertificateNotReady` alert firing.
- `kubectl get certificate -n health-watchers` shows `READY=False`.
- Browser shows expired/invalid certificate; ingress serves the old cert.
- `CertificateExpiringSoon` alert firing with no successful renewal.

**Diagnosis**

1. Inspect the certificate:
   ```bash
   kubectl describe certificate health-watchers-tls -n health-watchers
   ```
   Look at `Status.Conditions` and `Events` for the failure reason.

2. Inspect orders and challenges:
   ```bash
   kubectl get orders,challenges -A
   kubectl describe challenge <challenge-name> -n health-watchers
   kubectl describe order <order-name> -n health-watchers
   ```
   A failing HTTP01 challenge usually means the ACME validation URL is not
   reachable from the internet.

3. Check cert-manager logs:
   ```bash
   kubectl logs -n cert-manager deploy/cert-manager --tail=200
   kubectl logs -n cert-manager deploy/cert-manager-webhook --tail=100
   ```

4. Verify ACME HTTP01 reachability:
   ```bash
   # The challenge path must be served publicly over HTTP (port 80)
   curl -v http://app.healthwatchers.example.com/.well-known/acme-challenge/<token>
   ```
   Common causes: DNS not pointing at the ingress, ingress class mismatch,
   network policy blocking the ingress controller, or port 80 not exposed.

5. Check rate limits — if you see `too many failed authorizations` or
   `rateLimited`, you have hit Let's Encrypt limits. Switch to the staging
   issuer to debug, then wait for the limit window to reset.

**Remediation**

1. Fix the underlying cause (DNS, ingress, network policy, port 80).
2. Delete the stuck `CertificateRequest`/`Order`/`Challenge` so cert-manager
   retries cleanly:
   ```bash
   kubectl delete certificaterequest,order,challenge -n health-watchers \
     -l cert-manager.io/certificate-name=health-watchers-tls
   ```
3. If the certificate is wedged, delete and recreate it (the secret is
   re-issued):
   ```bash
   kubectl delete certificate health-watchers-tls -n health-watchers
   kubectl apply -f k8s/cert-manager-setup.yaml
   ```
4. Confirm recovery:
   ```bash
   kubectl get certificate -n health-watchers   # READY should be True
   kubectl get secret health-watchers-tls -n health-watchers
   ```
5. If production rate limits are blocking recovery, temporarily switch the
   ingress to a valid existing secret or the staging issuer to restore service,
   then re-issue against production once the limit resets.

## Deployment Workflow

### Prerequisites

1. Kubernetes cluster (1.19+)
2. `kubectl` configured to access cluster
3. cert-manager for TLS
4. Nginx ingress controller
5. Prometheus operator (optional, for monitoring)

### Step-by-step Deployment

1. **Create namespace**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   ```

2. **Create RBAC**
   ```bash
   kubectl apply -f k8s/rbac.yaml
   ```

3. **Configure application**
   ```bash
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/secrets.yaml
   ```

4. **Configure external secrets** (optional)
   ```bash
   kubectl apply -f k8s/external-secrets.yaml
   ```

5. **Deploy services**
   ```bash
   kubectl apply -f k8s/api/
   kubectl apply -f k8s/stellar-service/
   kubectl apply -f k8s/web/
   ```

6. **Configure networking**
   ```bash
   kubectl apply -f k8s/network-policies.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

7. **Setup monitoring** (optional)
   ```bash
   kubectl apply -f k8s/monitoring.yaml
   ```

Or apply all at once:
```bash
kubectl apply -f k8s/
```

### Verification

Check deployments:
```bash
kubectl get deployments -n health-watchers
kubectl get pods -n health-watchers
```

Check services:
```bash
kubectl get services -n health-watchers
```

Check ingress:
```bash
kubectl get ingress -n health-watchers
```

View deployment status:
```bash
kubectl describe deployment api -n health-watchers
kubectl logs deployment/api -n health-watchers
```

## Scaling and Updates

### Manual Scaling

Scale a deployment to desired replicas:
```bash
kubectl scale deployment api --replicas=3 -n health-watchers
```

### Rolling Updates

Update deployment image:
```bash
kubectl set image deployment/api \
  api=ghcr.io/chisom92/health-watchers-api:v1.2.0 \
  -n health-watchers
```

Automatic rollback on failure:
```bash
kubectl rollout undo deployment/api -n health-watchers
```

Watch rollout status:
```bash
kubectl rollout status deployment/api -n health-watchers
```

## Resource Management

### Quota

Set resource quotas for the namespace:
```bash
kubectl set quota hw-quota \
  --hard=requests.cpu=10,requests.memory=10Gi,limits.cpu=20,limits.memory=20Gi \
  -n health-watchers
```

### Resource Requests and Limits

Current allocations:
- **API**: 125m CPU / 250m limit, 128Mi / 256Mi memory
- **Stellar**: 50m CPU / 100m limit, 64Mi / 128Mi memory
- **Web**: 250m CPU / 500m limit, 256Mi / 512Mi memory

Adjust based on load monitoring.

## Security Considerations

1. **Network Policies**: Restrict inter-pod communication
2. **RBAC**: Minimal permissions per service account
3. **Secrets**: Encrypted at rest, use external secret management
4. **Non-root**: All containers run as non-root user
5. **Read-only filesystem**: Disabled by default, can be enabled
6. **Security context**: Dropped capabilities, no privilege escalation
7. **Pod Security Policy**: Enforce security standards

## Troubleshooting

### Pods not starting

Check pod status:
```bash
kubectl describe pod <pod-name> -n health-watchers
```

Check logs:
```bash
kubectl logs <pod-name> -n health-watchers
```

### Service not reachable

Verify service:
```bash
kubectl get svc -n health-watchers
kubectl describe svc api -n health-watchers
```

Test connectivity:
```bash
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  wget -qO- http://api:3001/health
```

### Ingress not working

Check ingress configuration:
```bash
kubectl get ingress -n health-watchers
kubectl describe ingress health-watchers -n health-watchers
```

Verify cert-manager (see [Certificate Management](#certificate-management-cert-manager)):
```bash
kubectl get certificate -n health-watchers
kubectl describe certificate health-watchers-cert -n health-watchers
```

## Production Checklist

- [ ] Namespace created and configured
- [ ] RBAC policies in place
- [ ] ConfigMaps and Secrets configured
- [ ] All deployments running with correct replicas
- [ ] Health checks passing
- [ ] Ingress configured with TLS
- [ ] cert-manager installed with staging + production ClusterIssuers
- [ ] Certificate `renewBefore` set to 720h (30 days)
- [ ] Certificate expiry / not-Ready Prometheus alerts configured
- [ ] Renewal tested in staging via `k8s/test-cert-manager.sh --renewal-test`
- [ ] Network policies enforced
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Disaster recovery tested

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Deployment Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Security in Kubernetes](https://kubernetes.io/docs/concepts/security/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [AWS Certificate Manager](https://docs.aws.amazon.com/acm/)
- [Helm Charts](../helm/README.md)
