# Resource Quota Sizing Guide

This guide explains how to size Kubernetes ResourceQuotas and LimitRanges for the Health Watchers application across different environments.

## Overview

Resource quotas and limit ranges prevent resource starvation in multi-tenant clusters by:
- **ResourceQuota**: Limits total resources across all pods in a namespace
- **LimitRange**: Sets default and maximum resources for individual containers/pods

## Quick Reference

| Environment | CPU Requests | CPU Limits | Memory Requests | Memory Limits | Max Pods |
|-------------|--------------|------------|-----------------|---------------|----------|
| Production  | 8 cores      | 16 cores   | 16 GiB          | 32 GiB        | 50       |
| Staging     | 4 cores      | 8 cores    | 8 GiB           | 16 GiB        | 30       |
| Preview (PR)| 2 cores      | 4 cores    | 4 GiB           | 8 GiB         | 10       |

## Sizing Methodology

### 1. Calculate Base Resource Requirements

Start by identifying resources needed for each service at baseline load:

#### Production Services (per replica)

| Service          | CPU Request | CPU Limit | Memory Request | Memory Limit | Replicas (min/max) |
|------------------|-------------|-----------|----------------|--------------|-------------------|
| API              | 125m        | 250m      | 128Mi          | 256Mi        | 2-10              |
| Web (Next.js)    | 250m        | 500m      | 256Mi          | 512Mi        | 2-8               |
| Stellar Service  | 50m         | 100m      | 64Mi           | 128Mi        | 2-10              |
| MongoDB          | 500m        | 1000m     | 1Gi            | 2Gi          | 3 (StatefulSet)   |
| Redis            | 50m         | 100m      | 64Mi           | 128Mi        | 1-3               |

#### Calculate Total Requirements

**Minimum (all services at min replicas):**
```
CPU Request: (2×125m + 2×250m + 2×50m + 3×500m + 1×50m) = 2.4 cores
CPU Limit:   (2×250m + 2×500m + 2×100m + 3×1000m + 1×100m) = 4.8 cores
Memory Request: (2×128Mi + 2×256Mi + 2×64Mi + 3×1Gi + 1×64Mi) = 3.96 GiB
Memory Limit:   (2×256Mi + 2×512Mi + 2×128Mi + 3×2Gi + 1×128Mi) = 7.88 GiB
```

**Maximum (all services at max replicas + overhead):**
```
CPU Request: (10×125m + 8×250m + 10×50m + 3×500m + 3×50m) = 5.4 cores
CPU Limit:   (10×250m + 8×500m + 10×100m + 3×1000m + 3×100m) = 10.3 cores
Memory Request: (10×128Mi + 8×256Mi + 10×64Mi + 3×1Gi + 3×64Mi) = 6.3 GiB
Memory Limit:   (10×256Mi + 8×512Mi + 10×128Mi + 3×2Gi + 3×128Mi) = 12.4 GiB
```

**Add 30-50% buffer for:**
- System overhead (metrics, logging, monitoring)
- Burst capacity during deployments
- Temporary debugging pods
- Future growth

### 2. Environment-Specific Adjustments

#### Production

**Target:** Support full scale + 50% buffer

```yaml
resourceQuota:
  hard:
    requests.cpu: "8"        # 5.4 × 1.5 ≈ 8
    requests.memory: "16Gi"  # 6.3 × 1.5 ≈ 10, rounded to 16
    limits.cpu: "16"         # 10.3 × 1.5 ≈ 16
    limits.memory: "32Gi"    # 12.4 × 1.5 ≈ 19, rounded to 32
    pods: "50"               # (10+8+10+3+3) + 16 buffer
```

#### Staging

**Target:** Run at 50% production capacity

```yaml
resourceQuota:
  hard:
    requests.cpu: "4"        # 50% of production
    requests.memory: "8Gi"   # 50% of production
    limits.cpu: "8"
    limits.memory: "16Gi"
    pods: "30"               # Reduced for fewer replicas
```

#### Preview (PR Environments)

**Target:** Minimal viable setup per PR

```yaml
resourceQuota:
  hard:
    requests.cpu: "2"        # 1 replica per service
    requests.memory: "4Gi"
    limits.cpu: "4"
    limits.memory: "8Gi"
    pods: "10"               # API + Web + MongoDB = ~6-8 pods
```

### 3. LimitRange Configuration

#### Container Defaults

**Default values** applied when containers don't specify resources:

```yaml
default:
  cpu: "500m"      # Reasonable limit for most containers
  memory: "512Mi"  # Prevents memory leaks from going unbounded

defaultRequest:
  cpu: "100m"      # Ensures scheduling efficiency
  memory: "128Mi"  # Baseline for most Node.js apps
```

#### Maximum Limits

**Prevents** individual containers from monopolizing namespace resources:

```yaml
max:
  cpu: "4"         # No single container needs more than 4 cores
  memory: "8Gi"    # Cap at 8GB (MongoDB is largest consumer)

min:
  cpu: "50m"       # Minimum viable for sidecar containers
  memory: "64Mi"   # Minimum for basic containers
```

#### Limit-to-Request Ratios

**Prevents** over-committing resources:

```yaml
maxLimitRequestRatio:
  cpu: "10"        # Limit can be 10× request (allows burst)
  memory: "4"      # Limit can be 4× request (less aggressive)
```

**Example:** If container requests 100m CPU, limit can be at most 1000m (1 core).

## Monitoring and Adjustment

### 1. Check Current Usage

```bash
# View quota usage
kubectl describe quota -n health-watchers

# Check resource utilization
kubectl top pods -n health-watchers

# View limit violations
kubectl get events -n health-watchers --field-selector reason=FailedCreate
```

### 2. Identify Issues

#### Quota Exceeded Symptoms

```bash
# Pods stuck in Pending state
kubectl get pods -n health-watchers | grep Pending

# Check event for quota errors
kubectl describe pod <pod-name> -n health-watchers
# Look for: "exceeded quota"
```

#### Under-provisioned Indicators

- HPA unable to scale up
- Frequent OOMKilled errors
- Pods pending due to "Insufficient cpu/memory"

#### Over-provisioned Indicators

- Consistently low utilization (<30%)
- Wasted cluster capacity
- High cost without performance benefit

### 3. Adjustment Process

1. **Gather metrics** over 7-14 days:
   ```bash
   kubectl top nodes
   kubectl top pods -n health-watchers --containers
   ```

2. **Calculate P95 usage** for each service

3. **Adjust quotas** using formula:
   ```
   New Quota = (P95 Usage × Number of Replicas × 1.3) + Overhead
   ```

4. **Test in staging** before applying to production

5. **Monitor** for 48 hours after changes

## Troubleshooting

### Problem: Pods won't schedule

**Symptom:** Pods stuck in Pending with "Insufficient cpu/memory"

**Solution:**
```bash
# Check namespace quota
kubectl describe resourcequota -n health-watchers

# Increase quota or reduce replica count
helm upgrade health-watchers ./helm/health-watchers \
  --set resourceQuota.hard.requests.cpu="12" \
  --set resourceQuota.hard.requests.memory="24Gi"
```

### Problem: HPA can't scale

**Symptom:** HPA shows "unable to scale: Insufficient cpu/memory"

**Solution:**
1. Check quota headroom: `kubectl describe quota -n health-watchers`
2. Ensure quota limits > (max replicas × container limits)
3. Increase quota limits if needed

### Problem: Pods without resource specs rejected

**Symptom:** "failed quota: default: must specify limits.cpu,limits.memory"

**Solution:**
```yaml
# Add to deployment.yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### Problem: OOMKilled despite quota headroom

**Symptom:** Container killed for out-of-memory, but namespace quota not exceeded

**Solution:**
1. Container hitting its own limit (not namespace quota)
2. Increase container memory limit:
   ```yaml
   resources:
     limits:
       memory: 1Gi  # Increase from 512Mi
   ```

## Examples by Use Case

### Use Case: Adding a new service

1. **Estimate resources** based on similar services
2. **Add to namespace quota calculation:**
   ```
   New Quota = Current Quota + (New Service × Replicas × 1.3)
   ```
3. **Update quota:**
   ```bash
   kubectl edit resourcequota health-watchers-quota -n health-watchers
   ```

### Use Case: Increasing replica count

**Before increasing HPA maxReplicas, ensure quota supports it:**

```bash
# Current: maxReplicas: 10
# Want:    maxReplicas: 20

# Calculate additional resources needed
ADDITIONAL_CPU=$((10 × 250m)) = 2.5 cores
ADDITIONAL_MEM=$((10 × 512Mi)) = 5 GiB

# Verify quota headroom
kubectl describe quota -n health-watchers
# Used: 4.5 / 8 cores, 8 GiB / 16 GiB memory
# Available: 3.5 cores, 8 GiB memory ✓ (sufficient)
```

### Use Case: Temporary quota increase for testing

```bash
# Temporarily increase quota for load testing
kubectl patch resourcequota health-watchers-quota -n health-watchers \
  --type='json' -p='[
    {"op": "replace", "path": "/spec/hard/limits.cpu", "value":"32"},
    {"op": "replace", "path": "/spec/hard/limits.memory", "value":"64Gi"}
  ]'

# Remember to revert after testing!
```

## Best Practices

### 1. Always Set Requests and Limits

```yaml
# ✅ Good
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# ❌ Bad (relies on defaults which may change)
resources: {}
```

### 2. Use Requests = Limits for Guaranteed QoS

For critical services that need guaranteed resources:

```yaml
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 500m      # Same as request
    memory: 512Mi  # Same as request
```

### 3. Review Quotas Quarterly

Set calendar reminders to:
- Review usage trends
- Adjust quotas based on growth
- Remove unused quota allocations
- Optimize container resource specs

### 4. Document Changes

Keep a changelog of quota adjustments:

```markdown
## 2024-03-15: Increased production CPU quota
- Previous: 8 cores
- New: 12 cores
- Reason: HPA unable to scale API during peak traffic
- Monitoring: Check P95 usage after 7 days
```

### 5. Use Separate Namespaces

Don't mix environments in one namespace:

```
✅ Good:
  - health-watchers (production)
  - health-watchers-staging
  - health-watchers-pr-123

❌ Bad:
  - health-watchers (all environments mixed)
```

## Reference Formulas

### Minimum Quota (Baseline)
```
Quota = Σ(Service CPU Request × Min Replicas) × 1.3
```

### Maximum Quota (Peak Load)
```
Quota = Σ(Service CPU Request × Max Replicas) × 1.5
```

### Container Limit (from P95 Usage)
```
Limit = P95 Usage × 1.5
Request = P95 Usage × 0.7
```

### Headroom Check
```
Available = Quota - Current Usage
Required = New Pod Requests
Deployable = Available ≥ Required
```

## Further Reading

- [Kubernetes Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- [Kubernetes LimitRange](https://kubernetes.io/docs/concepts/policy/limit-range/)
- [Managing Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Quality of Service Classes](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)

## Appendix: Quota YAML Templates

### Production Template
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: health-watchers-quota
  namespace: health-watchers
spec:
  hard:
    requests.cpu: "8"
    requests.memory: "16Gi"
    limits.cpu: "16"
    limits.memory: "32Gi"
    pods: "50"
    services: "20"
    persistentvolumeclaims: "10"
    requests.storage: "100Gi"
```

### LimitRange Template
```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: health-watchers-limits
  namespace: health-watchers
spec:
  limits:
    - type: Container
      default:
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      max:
        cpu: "4"
        memory: 8Gi
      min:
        cpu: 50m
        memory: 64Mi
      maxLimitRequestRatio:
        cpu: "10"
        memory: "4"
    - type: Pod
      max:
        cpu: "8"
        memory: 16Gi
      min:
        cpu: 50m
        memory: 64Mi
```
