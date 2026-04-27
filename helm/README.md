# Helm Chart — Health Watchers

A Helm chart for deploying Health Watchers to Kubernetes with configurable values for dev, staging, and production environments.

## Chart Structure

```
helm/health-watchers/
├── Chart.yaml                          # Chart metadata
├── values.yaml                         # Default values
├── values-staging.yaml                 # Staging overrides
├── values-production.yaml              # Production overrides
└── templates/
    ├── _helpers.tpl                    # Template helpers
    ├── namespace.yaml
    ├── configmap.yaml
    ├── secret.yaml                     # Inline secrets (non-prod)
    ├── external-secret.yaml            # ESO integration (prod)
    ├── api-deployment.yaml
    ├── api-service.yaml
    ├── api-hpa.yaml
    ├── web-deployment.yaml
    ├── web-service.yaml
    ├── stellar-service-deployment.yaml
    ├── stellar-service-service.yaml
    ├── ingress.yaml
    └── redis-deployment.yaml           # Optional Redis
```

## Prerequisites

- Helm 3.10+
- Kubernetes 1.25+
- cert-manager (for TLS)
- nginx ingress controller

## Installation

### Lint the chart

```bash
helm lint helm/health-watchers/
```

### Render templates (dry run)

```bash
# Default values
helm template health-watchers helm/health-watchers/

# With staging overrides
helm template health-watchers helm/health-watchers/ \
  -f helm/health-watchers/values-staging.yaml

# With production overrides
helm template health-watchers helm/health-watchers/ \
  -f helm/health-watchers/values-production.yaml
```

### Deploy to staging

```bash
helm upgrade --install health-watchers helm/health-watchers/ \
  -f helm/health-watchers/values.yaml \
  -f helm/health-watchers/values-staging.yaml \
  --namespace health-watchers-staging \
  --create-namespace \
  --set secrets.mongoUri="mongodb+srv://..." \
  --set secrets.jwtAccessTokenSecret="..." \
  --set secrets.fieldEncryptionKey="..."
```

### Deploy to production (with External Secrets Operator)

```bash
helm upgrade --install health-watchers helm/health-watchers/ \
  -f helm/health-watchers/values.yaml \
  -f helm/health-watchers/values-production.yaml \
  --namespace health-watchers \
  --create-namespace
```

> In production, `secrets.useExternalSecrets: true` is set in `values-production.yaml`, so no inline secret values are needed. ESO pulls them from your secrets provider.

## Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Container image registry | `ghcr.io/chisom92` |
| `api.replicaCount` | API pod replicas | `2` |
| `api.hpa.maxReplicas` | Max API pods (autoscaling) | `10` |
| `web.replicaCount` | Web pod replicas | `2` |
| `stellarService.replicaCount` | Stellar service replicas | `1` |
| `ingress.host` | Public hostname | `app.healthwatchers.example.com` |
| `ingress.tls.enabled` | Enable TLS via cert-manager | `true` |
| `secrets.useExternalSecrets` | Use ESO instead of inline secrets | `false` |
| `redis.enabled` | Deploy Redis sidecar | `false` |

## Updating Image Tags

```bash
helm upgrade health-watchers helm/health-watchers/ \
  --reuse-values \
  --set api.image.tag=v1.2.3 \
  --set web.image.tag=v1.2.3 \
  --set stellarService.image.tag=v1.2.3
```

## Uninstall

```bash
helm uninstall health-watchers --namespace health-watchers
```
