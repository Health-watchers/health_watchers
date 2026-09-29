# Kyverno Image Verification Policies

This directory contains Kyverno policies for verifying container image signatures and SBOM attestations.

## Overview

The policies enforce that:
1. **All production images must be signed** with cosign using keyless OIDC
2. **Images must be signed by GitHub Actions** from the health-watchers repository
3. **SBOM attestations** should be present (audit mode)
4. **Preview environments are exempt** from signature verification

## Installation

### 1. Install Kyverno

```bash
# Install Kyverno using Helm
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update

helm install kyverno kyverno/kyverno \
  --namespace kyverno \
  --create-namespace \
  --set replicaCount=3 \
  --set extraArgs[0]="--enableTracing" \
  --set extraArgs[1]="--tracingAddress=jaeger.monitoring:4317"
```

### 2. Apply Policies

```bash
# Apply the signature verification policies
kubectl apply -f k8s/kyverno-policies/verify-image-signatures.yaml

# Verify policies are installed
kubectl get clusterpolicy

# Check policy status
kubectl describe clusterpolicy verify-image-signatures
```

### 3. Test Signature Verification

```bash
# This should succeed (signed image)
kubectl run test-signed --image=ghcr.io/your-org/health-watchers-api:main --namespace=health-watchers

# This should fail (unsigned image)
kubectl run test-unsigned --image=nginx:latest --namespace=health-watchers
```

## Policy Details

### verify-image-signatures (Enforce)

**Validation Failure Action**: `Enforce` (blocks deployment)

Verifies that container images are signed with cosign using keyless OIDC. The signature must:
- Be from GitHub Actions workflow: `docker-build.yml`
- Use the issuer: `https://token.actions.githubusercontent.com`
- Be logged in Rekor transparency log

**Applies to**: 
- Namespaces: `health-watchers`, `health-watchers-staging`, `health-watchers-production`
- Services: api, web, stellar-service

### verify-sbom-attestations (Audit)

**Validation Failure Action**: `Audit` (logs but doesn't block)

Checks for SBOM attestations in SPDX format. This is in audit mode to provide visibility without blocking deployments if SBOMs are missing.

### allow-unsigned-images-in-preview (Audit)

**Validation Failure Action**: `Audit`

Exempts PR preview namespaces from signature verification since PR builds may use different signing workflows.

## Verification Commands

### Verify Image Signature Manually

```bash
# Set your image reference
IMAGE="ghcr.io/your-org/health-watchers-api:main"

# Verify signature with cosign
cosign verify ${IMAGE} \
  --certificate-identity-regexp="https://github.com/your-org/health-watchers.*" \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com

# Verify SBOM attestation
cosign verify-attestation ${IMAGE} \
  --type spdx \
  --certificate-identity-regexp="https://github.com/your-org/health-watchers.*" \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

### Check Kyverno Policy Reports

```bash
# View policy reports for a namespace
kubectl get policyreport -n health-watchers

# View cluster-wide policy reports
kubectl get clusterpolicyreport

# Describe a specific policy report
kubectl describe policyreport -n health-watchers
```

### View Policy Violations

```bash
# Check for policy violations
kubectl get policyreport -A -o json | \
  jq '.items[] | select(.results[].result == "fail")'

# View violations for a specific policy
kubectl get policyreport -A -o json | \
  jq '.items[] | .results[] | select(.policy == "verify-image-signatures")'
```

## Troubleshooting

### Policy Not Working

1. Check Kyverno is running:
   ```bash
   kubectl get pods -n kyverno
   ```

2. Check policy status:
   ```bash
   kubectl get clusterpolicy verify-image-signatures -o yaml
   ```

3. View Kyverno logs:
   ```bash
   kubectl logs -n kyverno -l app.kubernetes.io/name=kyverno -f
   ```

### Image Verification Failing

1. Verify the image is actually signed:
   ```bash
   cosign verify ${IMAGE} \
     --certificate-identity-regexp="https://github.com/.*" \
     --certificate-oidc-issuer=https://token.actions.githubusercontent.com
   ```

2. Check the certificate identity matches the policy:
   - Subject should contain the workflow path
   - Issuer should be `https://token.actions.githubusercontent.com`

3. Verify Rekor transparency log entry:
   ```bash
   rekor-cli search --email your-email@example.com
   ```

### Exempting Specific Workloads

To temporarily exempt a workload from signature verification:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  annotations:
    policies.kyverno.io/exclude: "verify-image-signatures"
spec:
  containers:
    - name: app
      image: my-unsigned-image:latest
```

## Policy Enforcement Strategy

| Environment | Signature Verification | SBOM Attestation | Action on Failure |
|-------------|------------------------|------------------|-------------------|
| Production | ✅ Required | ✅ Required (Audit) | Block deployment |
| Staging | ✅ Required | ✅ Required (Audit) | Block deployment |
| Preview (PR) | ⚠️ Exempt | ⚠️ Exempt | Allow deployment |
| Development | ⚠️ Exempt | ⚠️ Exempt | Allow deployment |

## Security Considerations

1. **Keyless signing** uses OIDC tokens from GitHub Actions, eliminating the need to manage signing keys
2. **Rekor transparency log** provides tamper-evident record of all signatures
3. **Certificate identity validation** ensures only images from authorized workflows are accepted
4. **SBOM attestations** enable vulnerability tracking and supply chain security

## Monitoring

Monitor policy enforcement with Prometheus metrics:

```promql
# Count of policy violations
kyverno_policy_rule_results_total{rule_result="fail"}

# Policy execution duration
kyverno_policy_rule_execution_duration_seconds
```

## References

- [Kyverno Documentation](https://kyverno.io/docs/)
- [Cosign Keyless Signing](https://docs.sigstore.dev/cosign/overview/)
- [SPDX SBOM Format](https://spdx.dev/)
- [Rekor Transparency Log](https://docs.sigstore.dev/rekor/overview/)
