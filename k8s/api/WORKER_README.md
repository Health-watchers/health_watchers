# API Worker Deployment

This directory contains Kubernetes manifests for deploying the Health Watchers API worker pods separately from the HTTP API service.

## Overview

The worker deployment allows background jobs to run independently from the HTTP API, enabling:

- **Independent Scaling**: Workers scale based on queue depth, not HTTP traffic
- **Resource Isolation**: Job processing doesn't impact API response times
- **Fault Isolation**: Worker failures don't affect API availability
- **Cost Optimization**: Scale workers down to zero during idle periods (with KEDA)

## Architecture

```
┌─────────────┐         ┌─────────────┐
│   API Pod   │         │ Worker Pod  │
│             │         │             │
│ HTTP Server │         │ Background  │
│ (Port 3001) │         │    Jobs     │
│             │         │             │
│ No Jobs ✗   │         │ All Jobs ✓  │
└──────┬──────┘         └──────┬──────┘
       │                       │
       └───────────┬───────────┘
                   │
            ┌──────▼──────┐
            │   MongoDB   │
            │    Redis    │
            └─────────────┘
```

## Components

### 1. Worker Deployment (`worker-deployment.yaml`)

Runs `node dist/worker.js` instead of the HTTP server. Includes:

- Graceful shutdown handling (60s termination grace period)
- Resource requests and limits
- Basic liveness/readiness probes
- Security context (non-root, no capabilities)

### 2. KEDA ScaledObject (`worker-keda-scaledobject.yaml`)

**Optional** - Requires [KEDA](https://keda.sh/) installed in your cluster.

Autoscales workers based on Redis queue depth using BullMQ patterns:

- **Triggers**: Monitors multiple BullMQ queues (`bull:*:wait` lists)
- **Scaling Policy**: Aggressive scale-up (1 min), conservative scale-down (5 min)
- **Range**: 1-10 replicas (configurable)

### 3. PodDisruptionBudget (`worker-pdb.yaml`)

Ensures at least 1 worker remains available during cluster maintenance.

## Deployment Options

### Option A: Standalone Kubernetes

Apply manifests directly:

```bash
# Deploy worker
kubectl apply -f k8s/api/worker-deployment.yaml
kubectl apply -f k8s/api/worker-pdb.yaml

# Optional: Install KEDA and apply ScaledObject
kubectl apply -f k8s/api/worker-keda-scaledobject.yaml
```

### Option B: Helm Chart

Enable workers in `values.yaml`:

```yaml
api:
  worker:
    enabled: true
    replicaCount: 1
    keda:
      enabled: true  # Requires KEDA operator
```

Deploy:

```bash
helm upgrade --install health-watchers ./helm/health-watchers \
  --set api.worker.enabled=true \
  --set api.worker.keda.enabled=true
```

## Configuration

### Environment Variables

Workers use the same ConfigMap and Secrets as the API:

- `MONGO_URI`: Database connection
- `REDIS_URL`: Queue backend (required for BullMQ)
- `WORKER_MODE=true`: Identifies worker pods (optional, for logging)

### Resource Sizing

**Development:**
```yaml
resources:
  requests: { memory: 256Mi, cpu: 250m }
  limits: { memory: 512Mi, cpu: 500m }
```

**Production** (adjust based on job load):
```yaml
resources:
  requests: { memory: 512Mi, cpu: 500m }
  limits: { memory: 1Gi, cpu: 1000m }
```

### KEDA Queue Triggers

Modify `worker-keda-scaledobject.yaml` to match your BullMQ queue names:

```yaml
triggers:
  - type: redis
    metadata:
      listName: "bull:your-queue-name:wait"
      listLength: "5"  # Scale up when 5+ jobs waiting
```

Default queues monitored:
- `bull:payment-expiration:wait`
- `bull:reconciliation:wait`
- `bull:notification-dispatch:wait`
- `bull:webhook-retry:wait`

## Monitoring

### Check Worker Status

```bash
# View worker pods
kubectl get pods -n health-watchers -l app=api-worker

# View worker logs
kubectl logs -n health-watchers -l app=api-worker -f

# Check KEDA scaling metrics (if enabled)
kubectl get scaledobject -n health-watchers
kubectl describe scaledobject api-worker-scaler -n health-watchers
```

### Metrics

Workers expose the same Prometheus metrics as the API:

- `job_duration_seconds`: Time taken per job type
- `job_errors_total`: Failed jobs by type
- `bullmq_queue_size`: Current queue depth (if instrumented)

## Troubleshooting

### Workers Not Starting

```bash
# Check pod events
kubectl describe pod -n health-watchers -l app=api-worker

# Common issues:
# - Missing Redis connection (REDIS_URL)
# - Database connection failures
# - Missing secrets/configmap
```

### KEDA Not Scaling

```bash
# Check KEDA operator logs
kubectl logs -n keda -l app=keda-operator

# Verify Redis connection
kubectl exec -it -n health-watchers <worker-pod> -- node -e "
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  redis.llen('bull:payment-expiration:wait').then(console.log);
"

# Check ScaledObject status
kubectl get scaledobject -n health-watchers -o yaml
```

### Jobs Not Processing

1. Verify workers are running: `kubectl get pods -l app=api-worker`
2. Check worker logs for errors
3. Verify Redis connectivity
4. Confirm BullMQ queue configuration matches trigger `listName`

## Migration from API-Embedded Jobs

To migrate from running jobs in API pods to dedicated workers:

1. **Deploy workers** with `enabled: false` initially
2. **Verify** workers connect to MongoDB and Redis
3. **Enable workers**: Set `api.worker.enabled: true`
4. **Update API** to skip job initialization (check for `WORKER_MODE` env var)
5. **Monitor** both API and worker logs during transition
6. **Scale down** API replicas if CPU/memory usage drops

## Disabling API Jobs

Modify `apps/api/src/app.ts` to conditionally skip jobs:

```typescript
// Only start jobs if not running in worker mode
if (process.env.WORKER_MODE !== 'true') {
  startPaymentExpirationJob();
  startReconciliationJob();
  // ... other jobs
}
```

Then redeploy API pods.

## References

- [KEDA Documentation](https://keda.sh/docs/)
- [BullMQ Queue Patterns](https://docs.bullmq.io/)
- [Kubernetes Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
