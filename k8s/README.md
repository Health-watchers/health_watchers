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
├── api/
│   ├── deployment.yaml         # API Deployment (2 replicas)
│   ├── service.yaml            # API ClusterIP Service
│   └── hpa.yaml                # HorizontalPodAutoscaler (2–10 replicas)
├── web/
│   ├── deployment.yaml         # Web Deployment (2 replicas)
│   └── service.yaml            # Web ClusterIP Service
└── stellar-service/
    ├── deployment.yaml         # Stellar Service Deployment (1 replica)
    └── service.yaml            # Stellar Service ClusterIP Service

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

# Deploy services
kubectl apply -f k8s/api/
kubectl apply -f k8s/web/
kubectl apply -f k8s/stellar-service/

# Apply ingress
kubectl apply -f k8s/ingress.yaml
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

The API service has a HorizontalPodAutoscaler configured:
- **Min replicas**: 2
- **Max replicas**: 10
- **Scale up trigger**: CPU > 70% or Memory > 80%
- **Scale down**: stabilized over 5 minutes to prevent flapping

## Health Probes

| Service         | Liveness          | Readiness         |
|-----------------|-------------------|-------------------|
| API             | GET /health/live  | GET /health/ready |
| Web             | GET /             | GET /             |
| Stellar Service | GET /health/live  | GET /health/ready |

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

## Helm Chart

See [`helm/health-watchers/`](../helm/health-watchers/) for the Helm chart with full environment support.
