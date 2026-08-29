# Helm Deployment Guide

This guide provides comprehensive instructions for deploying Health Watchers using Helm.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Chart Overview](#chart-overview)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Environment Setup](#environment-setup)
6. [Scaling and Updates](#scaling-and-updates)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **Kubernetes Cluster**: v1.19 or later
- **Helm**: v3.0 or later
- **kubectl**: Latest stable version

### Cluster Requirements

- At least 3 nodes (for high availability)
- 2+ CPU cores per node
- 4GB+ RAM per node
- Storage provisioner (for persistent volumes)
- Ingress controller (nginx recommended)
- cert-manager (for TLS certificates)

### Installation Check

```bash
# Check kubectl
kubectl cluster-info

# Check helm
helm version

# Check nodes
kubectl get nodes

# Check ingress controller
kubectl get deployment -n ingress-nginx
```

## Chart Overview

### Health Watchers Chart Structure

```
health-watchers/
├── Chart.yaml                    # Chart metadata (v2.0.0)
├── values.yaml                   # Default values
├── values-staging.yaml           # Staging overrides
├── values-production.yaml        # Production overrides
├── README.md                     # Chart README
└── templates/                    # Kubernetes templates
    ├── namespace.yaml
    ├── configmap.yaml
    ├── secret.yaml
    ├── rbac.yaml
    ├── network-policies.yaml
    ├── ingress.yaml
    ├── api-deployment.yaml
    ├── api-service.yaml
    ├── api-hpa.yaml
    ├── api-pdb.yaml
    ├── web-deployment.yaml
    ├── web-service.yaml
    ├── web-pdb.yaml
    ├── stellar-service-deployment.yaml
    ├── stellar-service-service.yaml
    ├── stellar-service-hpa.yaml
    └── stellar-service-pdb.yaml
```

### Services Deployed

| Service | Type | Port | Replicas | Purpose |
|---------|------|------|----------|---------|
| API | Deployment | 3001 | 2-10 | REST API backend |
| Web | Deployment | 3000 | 2-8 | Frontend UI |
| Stellar Service | Deployment | 3002 | 1-5 | Blockchain integration |

## Installation

### Step 1: Prepare Values Files

Create environment-specific values:

```bash
# Review default values
cat helm/health-watchers/values.yaml

# Review staging overrides
cat helm/health-watchers/values-staging.yaml

# Review production overrides
cat helm/health-watchers/values-production.yaml
```

### Step 2: Create Namespace

```bash
# Create namespace
kubectl create namespace health-watchers

# Verify namespace
kubectl get namespace health-watchers
```

### Step 3: Create Secrets

```bash
# Create secrets from environment variables
kubectl create secret generic health-watchers-secrets \
  --from-literal=MONGO_URI=mongodb://user:pass@mongo:27017 \
  --from-literal=JWT_ACCESS_TOKEN_SECRET=your-secret-key \
  --from-literal=JWT_REFRESH_TOKEN_SECRET=your-refresh-key \
  --from-literal=STELLAR_SECRET_KEY=your-stellar-secret \
  --from-literal=STELLAR_PUBLIC_KEY=your-stellar-public \
  --from-literal=GEMINI_API_KEY=your-gemini-key \
  -n health-watchers

# Verify secret
kubectl get secret -n health-watchers
```

### Step 4: Validate Chart

```bash
# Lint chart
helm lint helm/health-watchers

# Dry-run install (preview)
helm install health-watchers helm/health-watchers \
  -f helm/health-watchers/values.yaml \
  -f helm/health-watchers/values-production.yaml \
  --namespace health-watchers \
  --dry-run \
  --debug
```

### Step 5: Install Helm Release

```bash
# Install release
helm upgrade --install health-watchers helm/health-watchers \
  -f helm/health-watchers/values.yaml \
  -f helm/health-watchers/values-production.yaml \
  --namespace health-watchers \
  --create-namespace \
  --wait

# Verify installation
helm status health-watchers -n health-watchers
```

### Step 6: Verify Deployment

```bash
# Check pods
kubectl get pods -n health-watchers

# Check services
kubectl get svc -n health-watchers

# Check ingress
kubectl get ingress -n health-watchers

# Check pod logs
kubectl logs deployment/api -n health-watchers

# Describe resources
kubectl describe deployment api -n health-watchers
```

## Configuration

### Environment Variables

Set via values files:

```yaml
# values-production.yaml
api:
  env:
    NODE_ENV: production
    LOG_LEVEL: info
    MONGO_MAX_POOL_SIZE: 10
    REDIS_URL: redis://redis:6379

web:
  env:
    NODE_ENV: production
    NEXT_PUBLIC_STELLAR_NETWORK: mainnet

stellarService:
  env:
    NODE_ENV: production
    STELLAR_NETWORK: mainnet
    STELLAR_DRY_RUN: "false"
```

Override at install time:

```bash
helm install health-watchers helm/health-watchers \
  --set api.env.LOG_LEVEL=debug \
  --set web.env.NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

### Resource Configuration

Set CPU and memory limits:

```yaml
api:
  resources:
    requests:
      memory: "128Mi"
      cpu: "125m"
    limits:
      memory: "256Mi"
      cpu: "250m"
```

Scale resources:

```bash
helm upgrade health-watchers helm/health-watchers \
  --set api.resources.limits.memory="512Mi" \
  --set api.resources.limits.cpu="500m"
```

### Ingress Configuration

Configure domain and TLS:

```yaml
ingress:
  enabled: true
  className: nginx
  host: app.healthwatchers.example.com
  tls:
    enabled: true
    secretName: health-watchers-tls
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
```

Update domain:

```bash
helm upgrade health-watchers helm/health-watchers \
  --set ingress.host=api.mycompany.com
```

### Image Configuration

Update container images:

```bash
helm upgrade health-watchers helm/health-watchers \
  --set api.image.tag=v1.2.0 \
  --set web.image.tag=v1.2.0 \
  --set stellarService.image.tag=v1.2.0
```

## Environment Setup

### Staging Deployment

1. **Create staging namespace**
   ```bash
   kubectl create namespace health-watchers-staging
   ```

2. **Create staging secrets**
   ```bash
   kubectl create secret generic health-watchers-secrets \
     --from-literal=MONGO_URI=mongodb://staging-mongo \
     --from-literal=STELLAR_NETWORK=testnet \
     -n health-watchers-staging
   ```

3. **Deploy to staging**
   ```bash
   helm upgrade --install health-watchers helm/health-watchers \
     -f helm/health-watchers/values.yaml \
     -f helm/health-watchers/values-staging.yaml \
     --namespace health-watchers-staging \
     --create-namespace \
     --wait
   ```

### Production Deployment

1. **Create production namespace**
   ```bash
   kubectl create namespace health-watchers
   ```

2. **Create production secrets**
   ```bash
   kubectl create secret generic health-watchers-secrets \
     --from-literal=MONGO_URI=mongodb://prod-mongo \
     --from-literal=STELLAR_NETWORK=mainnet \
     -n health-watchers
   ```

3. **Deploy to production**
   ```bash
   helm upgrade --install health-watchers helm/health-watchers \
     -f helm/health-watchers/values.yaml \
     -f helm/health-watchers/values-production.yaml \
     --namespace health-watchers \
     --create-namespace \
     --wait
   ```

4. **Enable persistence (if using StatefulSets)**
   ```bash
   helm upgrade health-watchers helm/health-watchers \
     --set persistence.enabled=true \
     --set persistence.storageClass=fast-ssd
   ```

## Scaling and Updates

### Horizontal Scaling

Enable and configure HPA:

```yaml
api:
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80
```

Check HPA status:

```bash
kubectl get hpa -n health-watchers
kubectl describe hpa api -n health-watchers
```

Manual scaling:

```bash
# Scale to fixed replicas
helm upgrade health-watchers helm/health-watchers \
  --set api.replicaCount=5 \
  --set api.hpa.enabled=false

# Scale via kubectl
kubectl scale deployment api --replicas=5 -n health-watchers
```

### Rolling Updates

Update application version:

```bash
# Update single image
helm upgrade health-watchers helm/health-watchers \
  --set api.image.tag=v1.2.0

# Watch rollout
kubectl rollout status deployment/api -n health-watchers

# Rollout history
kubectl rollout history deployment/api -n health-watchers
```

### Rollback

Rollback to previous version:

```bash
# List release history
helm history health-watchers -n health-watchers

# Rollback Helm release
helm rollback health-watchers 1 -n health-watchers

# Rollback Kubernetes deployment
kubectl rollout undo deployment/api -n health-watchers
```

## Monitoring

### Cluster Status

Check cluster resources:

```bash
# Nodes
kubectl get nodes

# Resource usage
kubectl top nodes
kubectl top pods -n health-watchers

# Events
kubectl get events -n health-watchers
```

### Application Status

Monitor deployments:

```bash
# Deployments
kubectl get deployments -n health-watchers

# Pods
kubectl get pods -n health-watchers
kubectl get pods -n health-watchers -o wide

# Services
kubectl get svc -n health-watchers

# Ingress
kubectl get ingress -n health-watchers
```

### Logs

View application logs:

```bash
# Single pod
kubectl logs pod/api-123abc -n health-watchers

# Deployment logs
kubectl logs deployment/api -n health-watchers

# Follow logs
kubectl logs -f deployment/api -n health-watchers

# Previous logs (if pod crashed)
kubectl logs deployment/api --previous -n health-watchers

# All containers
kubectl logs deployment/api --all-containers=true -n health-watchers
```

### Health Checks

Test health endpoints:

```bash
# Port forward
kubectl port-forward svc/api 3001:3001 -n health-watchers

# Test in another terminal
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready
curl http://localhost:3001/health/startup
```

### Metrics

With Prometheus installed:

```bash
# Get metrics
kubectl port-forward svc/prometheus 9090:9090 -n prometheus

# Access Prometheus UI
# Navigate to http://localhost:9090
```

## Troubleshooting

### Helm Issues

Check release status:

```bash
# Status
helm status health-watchers -n health-watchers

# Get values
helm get values health-watchers -n health-watchers

# Get manifest
helm get manifest health-watchers -n health-watchers

# History
helm history health-watchers -n health-watchers
```

Validate chart:

```bash
# Lint
helm lint helm/health-watchers

# Template (render manifests)
helm template health-watchers helm/health-watchers
```

### Pod Issues

Debug pod failures:

```bash
# Describe pod
kubectl describe pod <pod-name> -n health-watchers

# View logs
kubectl logs <pod-name> -n health-watchers

# Shell into pod
kubectl exec -it <pod-name> -n health-watchers -- /bin/sh

# Debug pod
kubectl debug -it pod/<pod-name> -n health-watchers
```

### Service Issues

Troubleshoot connectivity:

```bash
# Check service
kubectl get svc -n health-watchers

# Check endpoints
kubectl get endpoints -n health-watchers

# Test DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup api.health-watchers.svc.cluster.local

# Test connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  wget -qO- http://api:3001/health
```

### Ingress Issues

Troubleshoot ingress routing:

```bash
# Check ingress
kubectl get ingress -n health-watchers

# Describe ingress
kubectl describe ingress health-watchers -n health-watchers

# Check certificate
kubectl get certificate -n health-watchers

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager
```

### Common Errors

#### ImagePullBackOff
```bash
# Check image availability
kubectl describe pod <pod-name> -n health-watchers

# Check image pull secrets
kubectl get secret -n health-watchers

# Update image registry
helm upgrade health-watchers helm/health-watchers \
  --set global.imageRegistry=myregistry.com
```

#### CrashLoopBackOff
```bash
# Check pod logs
kubectl logs <pod-name> -n health-watchers

# Check previous logs
kubectl logs <pod-name> --previous -n health-watchers

# Describe for errors
kubectl describe pod <pod-name> -n health-watchers
```

#### Pending Pods
```bash
# Check pod events
kubectl describe pod <pod-name> -n health-watchers

# Check resource availability
kubectl describe nodes

# Check resource requests
kubectl get pod <pod-name> -n health-watchers -o yaml | grep -A 5 resources
```

## Best Practices

1. **Always validate before applying**
   ```bash
   helm lint .
   helm template . --values values-production.yaml
   ```

2. **Use separate values files per environment**
   - Base: `values.yaml`
   - Staging: `values-staging.yaml`
   - Production: `values-production.yaml`

3. **Never commit secrets to Git**
   - Use Kubernetes Secrets
   - Use External Secrets Operator
   - Use CI/CD secret management

4. **Always set resource requests and limits**
   - Enables proper scheduling
   - Prevents resource starvation
   - Required for HPA

5. **Use health checks**
   - Startup probes for initialization
   - Readiness probes for traffic
   - Liveness probes for recovery

6. **Enable Pod Disruption Budgets**
   - Protects against disruptions
   - Ensures minimum availability

7. **Monitor and log**
   - Enable Prometheus metrics
   - Aggregate logs
   - Use distributed tracing

## References

- [Helm Chart README](../helm/health-watchers/README.md)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
