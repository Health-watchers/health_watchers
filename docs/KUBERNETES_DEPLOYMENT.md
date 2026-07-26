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

Verify cert-manager:
```bash
kubectl get certificate -n health-watchers
```

## Production Checklist

- [ ] Namespace created and configured
- [ ] RBAC policies in place
- [ ] ConfigMaps and Secrets configured
- [ ] All deployments running with correct replicas
- [ ] Health checks passing
- [ ] Ingress configured with TLS
- [ ] Network policies enforced
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Disaster recovery tested

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Deployment Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Security in Kubernetes](https://kubernetes.io/docs/concepts/security/)
- [Helm Charts](../helm/README.md)
