# Auto-Scaling Configuration Guide

## Overview

The Health Watchers application implements Kubernetes Horizontal Pod Autoscaler (HPA) for automatic scaling of API and web services based on resource metrics.

## Architecture

```
┌─────────────────────────────────┐
│   Kubernetes Metrics Server     │
│  (CPU, Memory, Custom Metrics)  │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  HPA Controller                 │
│  (Monitors metrics, scales pods)│
└────────────────┬────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
    ┌────────┐        ┌────────┐
    │ API    │        │  Web   │
    │ Pods   │        │ Pods   │
    └────────┘        └────────┘
```

## Scaling Policies

### API Service

**Configuration**: `k8s/api/hpa.yaml`

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Min Replicas | 2 | Minimum pods to maintain |
| Max Replicas | 10 | Maximum pods allowed |
| Target CPU | 70% | Scale up when CPU exceeds this |
| Target Memory | 80% | Scale up when memory exceeds this |
| Scale Up Window | 30s | Aggressive scaling up |
| Scale Down Window | 300s | Conservative scaling down |

#### Scale Up Behavior
```yaml
scaleUp:
  policies:
    - Double replicas (100% increase) OR
    - Add 4 pods (whichever is larger)
  periodSeconds: 30
  selectPolicy: Max  # Use most aggressive policy
```

#### Scale Down Behavior
```yaml
scaleDown:
  policies:
    - Remove 50% of replicas OR
    - Remove 1 pod (whichever is smaller)
  periodSeconds: 60
  stabilizationWindowSeconds: 300  # Wait 5 min before scaling
  selectPolicy: Min  # Use most conservative policy
```

### Web Service

**Configuration**: `k8s/web/hpa.yaml`

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Min Replicas | 2 | Minimum pods to maintain |
| Max Replicas | 8 | Maximum pods allowed |
| Target CPU | 75% | Scale up when CPU exceeds this |
| Target Memory | 80% | Scale up when memory exceeds this |

## Scaling Metrics

### Primary Metrics

#### 1. CPU Utilization
- **Source**: Container resource requests
- **Threshold**: 70% (API), 75% (Web)
- **Action**: Scale up when exceeded for 2+ minutes

#### 2. Memory Utilization
- **Source**: Container spec limits
- **Threshold**: 80%
- **Action**: Scale up when exceeded for 2+ minutes

### Custom Metrics (Optional)

If Prometheus is configured:

```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: '1000'
```

## Monitoring and Alerting

### Prometheus Alerts

The following alerts are configured in `k8s/prometheus-rules.yaml`:

#### Critical Alerts

1. **HPAAtMaxReplicas**
   - Triggers: When HPA reaches max replicas for 5 minutes
   - Action: Increase `maxReplicas` or optimize application

2. **HPAScalingFailure**
   - Triggers: When HPA cannot scale (resource limits, node capacity)
   - Action: Check node capacity, quotas, and resource availability

#### Warning Alerts

1. **HighCPUUtilization**
   - Triggers: When CPU > 70% for 2 minutes
   - Action: Monitor application performance

2. **HighMemoryUtilization**
   - Triggers: When memory > 80% for 2 minutes
   - Action: Review memory leaks and optimize application

3. **FrequentScalingEvents**
   - Triggers: When scaling happens > 0.5x per 10 minutes
   - Action: Review scaling policies - may indicate oscillation

## Checking Scaling Status

### Using kubectl

```bash
# Check current replicas
kubectl get hpa -n health-watchers
kubectl get hpa api-hpa -n health-watchers -o yaml

# Watch HPA scaling in real-time
kubectl get hpa api-hpa -n health-watchers --watch

# Check scaling history
kubectl describe hpa api-hpa -n health-watchers

# View last scaling events
kubectl get events -n health-watchers --sort-by='.lastTimestamp' \
  | grep -i horizontal
```

### Example Output

```
NAME      REFERENCE           TARGETS          MINPODS   MAXPODS   REPLICAS   AGE
api-hpa   Deployment/api      75%/70%, 60%/80% 2         10        5          2h
```

- **TARGETS**: Current CPU/Target, Current Memory/Target
- **REPLICAS**: Number of pods currently running

## Performance Tuning

### Scenario 1: Rapid Oscillation

**Problem**: Pods rapidly scale up and down

**Solution**:
```yaml
scaleUp:
  stabilizationWindowSeconds: 60   # Increase from 30
scaleDown:
  stabilizationWindowSeconds: 600  # Increase from 300
```

### Scenario 2: Too Many Pods

**Problem**: App scales to many replicas but doesn't help

**Solution**:
1. Increase `maxReplicas` gradually: Try 20, 30, etc.
2. Check if bottleneck is elsewhere (database, external API)
3. Reduce CPU threshold: Try 60% instead of 70%

### Scenario 3: Not Scaling Enough

**Problem**: High load but not scaling

**Solution**:
```yaml
scaleUp:
  policies:
    - type: Percent
      value: 200    # Scale up faster
      periodSeconds: 15
```

### Scenario 4: Stuck at Max Replicas

**Problem**: HPA alert "at max replicas"

**Solutions**:
1. Increase `maxReplicas`
2. Optimize application performance
3. Check node capacity: `kubectl top nodes`
4. Check resource quotas: `kubectl describe quota -n health-watchers`

## Load Testing

### Using k6 for Load Testing

Located in `/workspaces/health_watchers/k6/`

```bash
# Install k6
curl https://get.k6.io | bash

# Run basic load test
k6 run script.js

# Watch scaling
kubectl get hpa -n health-watchers --watch
```

### Expected Scaling Behavior

1. **Baseline** (0-100 req/s): 2-3 pods
2. **Medium Load** (100-500 req/s): 4-6 pods
3. **High Load** (500+ req/s): 7-10 pods

## Vertical Pod Autoscaling (Optional)

For workloads where horizontal scaling isn't enough:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  updatePolicy:
    updateMode: "Auto"  # Automatically update resource requests
```

## Cost Optimization

### Recommendations

1. **Right-size resource requests**
   ```bash
   kubectl top pods -n health-watchers
   ```

2. **Use Pod Disruption Budgets**
   - Ensures availability during scaling
   - Located in `k8s/*/pdb.yaml`

3. **Combine with Cluster Autoscaler**
   - Automatically adds/removes nodes
   - Configure in your Kubernetes cluster settings

## Troubleshooting

### HPA Not Scaling

```bash
# 1. Check HPA status
kubectl get hpa -n health-watchers -o yaml

# 2. Check metrics available
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1 | jq .

# 3. Check Metrics Server
kubectl get deployment metrics-server -n kube-system

# 4. Check pod metrics
kubectl top pods -n health-watchers
```

### High CPU but Not Scaling

**Possible Causes**:
1. Metrics Server not running
2. CPU threshold too high
3. Insufficient node capacity
4. Resource requests not set correctly

**Check**:
```bash
# Verify resource requests
kubectl get pod <pod-name> -n health-watchers -o yaml | grep -A5 resources:

# Should show:
# requests:
#   cpu: 125m
#   memory: 128Mi
```

## Advanced Configuration

### Custom Metrics

Integrate with external metrics provider:

```yaml
metrics:
  - type: External
    external:
      metric:
        name: requests_per_second
      target:
        type: AverageValue
        averageValue: '1000'
```

### Target Utilization vs Average Value

- **Utilization**: Percentage of resource request
  ```
  CPU Used / CPU Requested = %
  ```

- **Average Value**: Absolute metric value
  ```
  Total Metric Value / Number of Pods = Average
  ```

## References

- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [HPA Behavior Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#scaling-policies)
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server)
- [Custom Metrics API](https://github.com/kubernetes/community/blob/master/contributors/design-proposals/instrumentation/custom-metrics-api.md)
