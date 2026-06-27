# Health Watchers Helm Charts

This directory contains Helm charts for deploying Health Watchers to Kubernetes clusters.

## Overview

Helm is a package manager for Kubernetes that allows you to define, install, and upgrade complex Kubernetes applications. The Health Watchers Helm charts provide:

- **Templated Manifests**: Reusable Kubernetes manifests
- **Environment Management**: Separate configurations for staging and production
- **Best Practices**: Security, scaling, and monitoring built-in
- **Easy Deployment**: Single command installation and upgrades

## Directory Structure

```
helm/
├── health-watchers/                    # Main application chart
│   ├── Chart.yaml                     # Chart metadata
│   ├── values.yaml                    # Default configuration
│   ├── values-staging.yaml            # Staging overrides
│   ├── values-production.yaml         # Production overrides
│   ├── README.md                      # Chart documentation
│   └── templates/                     # Kubernetes manifest templates
│       ├── api-deployment.yaml
│       ├── api-service.yaml
│       ├── web-deployment.yaml
│       ├── stellar-service-deployment.yaml
│       ├── ingress.yaml
│       ├── configmap.yaml
│       ├── secret.yaml
│       ├── rbac.yaml
│       ├── network-policies.yaml
│       └── ...
└── README.md                          # This file
```

## Quick Start

### Installation Steps

1. **Prerequisites**
   ```bash
   # Check kubectl and helm are installed
   kubectl version
   helm version

   # Configure kubectl to access your cluster
   kubectl config current-context
   ```

2. **Deploy to Staging**
   ```bash
   helm upgrade --install health-watchers ./health-watchers \
     -f health-watchers/values.yaml \
     -f health-watchers/values-staging.yaml \
     --namespace health-watchers-staging \
     --create-namespace \
     --wait
   ```

3. **Deploy to Production**
   ```bash
   helm upgrade --install health-watchers ./health-watchers \
     -f health-watchers/values.yaml \
     -f health-watchers/values-production.yaml \
     --namespace health-watchers \
     --create-namespace \
     --wait
   ```

4. **Verify Deployment**
   ```bash
   # Check release status
   helm status health-watchers -n health-watchers

   # Check pods
   kubectl get pods -n health-watchers

   # Check ingress
   kubectl get ingress -n health-watchers
   ```

## Chart: health-watchers

The main application chart deploying all Health Watchers services.

### Quick Installation
```bash
helm upgrade --install health-watchers ./health-watchers \
  -f health-watchers/values-production.yaml \
  --namespace health-watchers \
  --create-namespace
```

### Features

- ✅ Multi-service deployment (API, Web, Stellar Service)
- ✅ Automatic scaling (HPA)
- ✅ Pod disruption budgets (PDB)
- ✅ Health checks (startup, readiness, liveness)
- ✅ Network policies for security
- ✅ Ingress with TLS
- ✅ ConfigMap and Secrets
- ✅ RBAC
- ✅ Prometheus monitoring

For detailed information, see [health-watchers README](./health-watchers/README.md).

## Common Commands

```bash
# Lint chart
helm lint ./health-watchers

# Dry-run (preview changes)
helm install health-watchers ./health-watchers --dry-run --debug

# Install release
helm install health-watchers ./health-watchers -f values-production.yaml

# Upgrade release
helm upgrade health-watchers ./health-watchers -f values-production.yaml

# Check status
helm status health-watchers

# Rollback to previous version
helm rollback health-watchers

# Uninstall release
helm uninstall health-watchers
```

## Configuration

Override values:

```bash
# Via command line
helm install health-watchers ./health-watchers \
  --set api.replicaCount=3 \
  --set web.replicaCount=3

# Via values file
helm install health-watchers ./health-watchers \
  -f values-production.yaml \
  -f my-custom-values.yaml
```

## Environments

The chart supports multiple environments:

### Staging
```bash
helm upgrade --install health-watchers ./health-watchers \
  -f health-watchers/values.yaml \
  -f health-watchers/values-staging.yaml \
  --namespace health-watchers-staging
```

### Production
```bash
helm upgrade --install health-watchers ./health-watchers \
  -f health-watchers/values.yaml \
  -f health-watchers/values-production.yaml \
  --namespace health-watchers
```

## Monitoring

Check deployment status:

```bash
# Pods
kubectl get pods -n health-watchers

# Services
kubectl get svc -n health-watchers

# Ingress
kubectl get ingress -n health-watchers

# HPA status
kubectl get hpa -n health-watchers

# Events
kubectl get events -n health-watchers
```

View logs:

```bash
# All pods
kubectl logs -l app=api -n health-watchers

# Follow logs
kubectl logs -f deployment/api -n health-watchers
```

## Troubleshooting

### Check Helm Release
```bash
helm status health-watchers -n health-watchers
helm get values health-watchers -n health-watchers
helm get manifest health-watchers -n health-watchers
```

### Check Pods
```bash
kubectl describe pod <pod-name> -n health-watchers
kubectl logs <pod-name> -n health-watchers
```

### Validate Chart
```bash
helm lint ./health-watchers
helm template health-watchers ./health-watchers
```

## References

- [Chart README](./health-watchers/README.md)
- [Helm Docs](https://helm.sh/docs/)
- [Kubernetes Docs](https://kubernetes.io/docs/)
