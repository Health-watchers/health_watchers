# Health Watchers Helm Chart

A complete Helm chart for deploying Health Watchers - a comprehensive healthcare management platform with Stellar blockchain integration - on Kubernetes.

## Chart Details

- **Chart Name**: health-watchers
- **Chart Version**: 2.0.0
- **App Version**: 2.0.0
- **Kubernetes Version**: >= 1.19.0
- **Type**: Application

## Features

- ✅ Multi-environment support (staging, production)
- ✅ Horizontal Pod Autoscaling (HPA)
- ✅ Pod Disruption Budgets (PDB)
- ✅ Comprehensive health checks (startup, readiness, liveness)
- ✅ Security best practices (non-root user, RBAC, network policies)
- ✅ Ingress configuration with TLS support
- ✅ External Secrets management
- ✅ Resource quotas and limits
- ✅ Prometheus monitoring integration
- ✅ Templated configuration management

## Quick Start

### Prerequisites

- Kubernetes cluster (v1.19+)
- Helm 3.0+
- kubectl configured to access your cluster

### Installation

1. **Add the Helm repository** (if published)
   ```bash
   helm repo add health-watchers https://charts.health-watchers.app
   helm repo update
   ```

2. **Install to staging environment**
   ```bash
   helm upgrade --install health-watchers ./health-watchers \
     -f health-watchers/values.yaml \
     -f health-watchers/values-staging.yaml \
     --namespace health-watchers-staging \
     --create-namespace
   ```

3. **Install to production environment**
   ```bash
   helm upgrade --install health-watchers ./health-watchers \
     -f health-watchers/values.yaml \
     -f health-watchers/values-production.yaml \
     --namespace health-watchers \
     --create-namespace
   ```

### Verify Installation

```bash
# Check release status
helm status health-watchers -n health-watchers

# Check pod status
kubectl get pods -n health-watchers

# View deployment details
kubectl describe deployment api -n health-watchers

# Check ingress
kubectl get ingress -n health-watchers
```

## Configuration

### Global Settings

Global configuration applicable to all services:

```yaml
global:
  imageRegistry: ghcr.io/chisom92  # Container registry
  imagePullPolicy: Always           # Image pull policy
  namespace: health-watchers        # Kubernetes namespace
```

### Environment-Specific Values

Override values per environment using separate files:

- `values.yaml` - Default values for development
- `values-staging.yaml` - Staging environment overrides
- `values-production.yaml` - Production environment overrides

Apply multiple values files:
```bash
helm install health-watchers ./health-watchers \
  -f values.yaml \
  -f values-production.yaml
```

## Services Configuration

### API Service

The main REST API backend:

```yaml
api:
  enabled: true
  image:
    repository: health-watchers-api
    tag: latest
  replicaCount: 2              # Number of replicas
  resources:
    requests:
      memory: "128Mi"
      cpu: "125m"
    limits:
      memory: "256Mi"
      cpu: "250m"
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
  service:
    type: ClusterIP
    port: 3001
```

### Web Frontend

Next.js-based web frontend:

```yaml
web:
  enabled: true
  image:
    repository: health-watchers-web
    tag: latest
  replicaCount: 2
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"
  service:
    type: ClusterIP
    port: 3000
```

### Stellar Service

Blockchain integration service:

```yaml
stellarService:
  enabled: true
  image:
    repository: health-watchers-stellar-service
    tag: latest
  replicaCount: 1
  resources:
    requests:
      memory: "64Mi"
      cpu: "50m"
    limits:
      memory: "128Mi"
      cpu: "100m"
  service:
    type: ClusterIP
    port: 3002
```

## Ingress Configuration

### Domain Configuration

```yaml
ingress:
  enabled: true
  className: nginx                           # Ingress class
  host: app.healthwatchers.example.com      # Your domain
  tls:
    enabled: true
    secretName: health-watchers-tls         # TLS certificate secret
```

### TLS Certificate

Using cert-manager for automatic certificate provisioning:

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
```

## Health Checks

All services include three types of health checks:

### Startup Probe
Verifies the application has started:
```yaml
startupProbe:
  httpGet:
    path: /health/startup
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 24
```

### Readiness Probe
Verifies the application can accept traffic:
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

### Liveness Probe
Verifies the application is still running:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 15
  periodSeconds: 20
  failureThreshold: 3
```

## Persistence

### ConfigMap

Application configuration stored in ConfigMap:

```bash
kubectl get configmap -n health-watchers
kubectl describe configmap health-watchers-config -n health-watchers
```

Override ConfigMap values:
```bash
helm install health-watchers ./health-watchers \
  --set api.env.LOG_LEVEL=debug \
  --set web.env.NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

### Secrets

Sensitive data stored in Kubernetes Secrets:

```bash
kubectl get secrets -n health-watchers
kubectl describe secret health-watchers-secrets -n health-watchers
```

Use External Secrets Operator for production:
```yaml
secrets:
  useExternalSecrets: true
  externalSecretStore: aws-secrets  # Secret backend
```

## Scaling and Updates

### Manual Scaling

Scale a service to desired replicas:
```bash
helm upgrade health-watchers ./health-watchers \
  --set api.replicaCount=5
```

Or update via kubectl:
```bash
kubectl scale deployment api --replicas=5 -n health-watchers
```

### Rolling Updates

Update image versions:
```bash
helm upgrade health-watchers ./health-watchers \
  --set api.image.tag=v1.2.0 \
  --set web.image.tag=v1.2.0
```

### Automatic Scaling (HPA)

HPA automatically scales based on CPU/memory metrics. Disable if not needed:

```yaml
api:
  hpa:
    enabled: false
```

## Security

### Pod Security Context

All pods run as non-root user:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
```

### Network Policies

Network policies restrict traffic to only necessary pods:
```bash
kubectl get networkpolicy -n health-watchers
```

### RBAC

Minimal permissions via ServiceAccounts and Roles:
```bash
kubectl get serviceaccount -n health-watchers
kubectl get role -n health-watchers
```

## Monitoring

### Prometheus Integration

ServiceMonitors for Prometheus scraping:

```bash
kubectl get servicemonitor -n health-watchers
```

Configure scrape interval and path in values:
```yaml
monitoring:
  enabled: true
  prometheus:
    interval: 30s
    path: /metrics
```

### Logs

View application logs:
```bash
kubectl logs deployment/api -n health-watchers
kubectl logs -f deployment/api -n health-watchers  # Follow logs
```

## Troubleshooting

### Pod not starting
```bash
kubectl describe pod <pod-name> -n health-watchers
kubectl logs <pod-name> -n health-watchers
```

### Service not reachable
```bash
kubectl get svc -n health-watchers
kubectl get endpoints -n health-watchers
```

### Check Helm values
```bash
helm get values health-watchers -n health-watchers
helm get manifest health-watchers -n health-watchers
```

### Upgrade issues
```bash
# Rollback to previous version
helm rollback health-watchers -n health-watchers

# Check release history
helm history health-watchers -n health-watchers
```

## Template Structure

### Directory Layout

```
health-watchers/
├── Chart.yaml                       # Chart metadata
├── values.yaml                      # Default values
├── values-staging.yaml              # Staging overrides
├── values-production.yaml           # Production overrides
├── README.md                        # This file
├── templates/
│   ├── _helpers.tpl                # Template helpers
│   ├── namespace.yaml               # Namespace definition
│   ├── configmap.yaml               # ConfigMap
│   ├── secret.yaml                  # Secrets
│   ├── rbac.yaml                    # RBAC resources
│   ├── network-policies.yaml        # Network policies
│   ├── ingress.yaml                 # Ingress configuration
│   ├── api-deployment.yaml          # API deployment
│   ├── api-service.yaml             # API service
│   ├── api-hpa.yaml                 # API HPA
│   ├── api-pdb.yaml                 # API PDB
│   ├── web-deployment.yaml          # Web deployment
│   ├── web-service.yaml             # Web service
│   ├── web-pdb.yaml                 # Web PDB
│   ├── stellar-service-deployment.yaml  # Stellar deployment
│   ├── stellar-service-service.yaml     # Stellar service
│   ├── stellar-service-hpa.yaml         # Stellar HPA
│   └── stellar-service-pdb.yaml         # Stellar PDB
└── README.md                        # Chart documentation
```

### Template Helpers

Common template helpers defined in `_helpers.tpl`:

- `health-watchers.name` - Chart name
- `health-watchers.fullname` - Full application name
- `health-watchers.chart` - Chart reference
- `health-watchers.labels` - Standard labels
- `health-watchers.selectorLabels` - Label selectors

## Environment Variables

### API Service Defaults
- `NODE_ENV`: production
- `API_PORT`: 3001
- `LOG_LEVEL`: info
- `MONGO_MAX_POOL_SIZE`: 10
- `REDIS_URL`: redis://redis:6379
- `OTEL_SAMPLING_RATE`: 0.1

### Web Frontend Defaults
- `NODE_ENV`: production
- `NEXT_TELEMETRY_DISABLED`: 1
- `NEXT_PUBLIC_API_URL`: https://app.healthwatchers.example.com/api
- `NEXT_PUBLIC_STELLAR_NETWORK`: mainnet

### Stellar Service Defaults
- `NODE_ENV`: production
- `STELLAR_NETWORK`: mainnet
- `STELLAR_DRY_RUN`: false
- `MAINNET_CONFIRMED`: true

Override via values:
```yaml
api:
  env:
    LOG_LEVEL: debug
    OTEL_SAMPLING_RATE: 1.0
```

## Best Practices

1. **Use separate values files per environment**
   - Base values in `values.yaml`
   - Environment overrides in `values-{env}.yaml`

2. **Don't store secrets in values files**
   - Use Kubernetes Secrets
   - Use External Secrets Operator
   - Use CI/CD secrets management

3. **Use meaningful names and labels**
   - Helps with resource tracking
   - Enables better querying
   - Supports tools like Prometheus

4. **Always set resource requests and limits**
   - Enables cluster autoscaling
   - Prevents resource starvation
   - Required for HPA

5. **Enable PDB for high-availability**
   - Prevents accidental pod disruption
   - Ensures minimum availability

6. **Use health checks**
   - Startup probes for initialization
   - Readiness probes for traffic routing
   - Liveness probes for health monitoring

7. **Monitor and log**
   - Enable Prometheus integration
   - Configure log aggregation
   - Use distributed tracing

## Helm Commands Reference

```bash
# Validate chart
helm lint ./health-watchers

# Dry-run installation (preview changes)
helm install health-watchers ./health-watchers --dry-run --debug

# Install release
helm install health-watchers ./health-watchers -f values-production.yaml

# Upgrade release
helm upgrade health-watchers ./health-watchers -f values-production.yaml

# Rollback to previous release
helm rollback health-watchers 1

# Uninstall release
helm uninstall health-watchers

# Get release values
helm get values health-watchers

# Get release manifest
helm get manifest health-watchers

# Check release history
helm history health-watchers

# Test release
helm test health-watchers
```

## Contributing

To modify the Helm chart:

1. Update values in `values*.yaml`
2. Update templates in `templates/`
3. Update `Chart.yaml` version
4. Validate with `helm lint`
5. Test in staging environment
6. Submit changes via pull request

## Support

For issues or questions:

1. Check Kubernetes events: `kubectl describe pod <name>`
2. Review application logs: `kubectl logs <name>`
3. Validate manifests: `helm template`
4. Check GitHub issues: https://github.com/Chisom92/health_watchers/issues

## License

MIT License - see LICENSE file for details

## Resources

- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Health Watchers GitHub](https://github.com/Chisom92/health_watchers)
