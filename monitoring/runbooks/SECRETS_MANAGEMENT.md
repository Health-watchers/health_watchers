# Secrets Management Runbook

## Overview
Health Watchers uses AWS Secrets Manager as the authoritative secrets store with the External Secrets Operator (ESO) syncing secrets into Kubernetes. All access is audited via Kubernetes Audit Policy and AWS CloudTrail.

## Architecture

```
AWS Secrets Manager
       │
       │  (sync every 1h via IRSA)
       ▼
External Secrets Operator
       │
       ▼
Kubernetes Secrets  ──▶  Application Pods
       │
       ▼
k8s Audit Log + CloudTrail
```

## Secrets Stored

| Path in AWS | Type | Rotation |
|---|---|---|
| `health-watchers/production` | All app secrets (JSON) | Per-field (see below) |
| `health-watchers/production/mongo-password` | DB credential | 30 days |
| `health-watchers/production/jwt-secret` | JWT signing key | 90 days |
| `health-watchers/production/stellar-keys` | Stellar keypair | 180 days (manual) |
| `health-watchers/production/api-keys` | Third-party API keys | 60 days |

## Operations

### View current secret (audit-safe — values NOT echoed)
```bash
# Describe secret metadata only
aws secretsmanager describe-secret \
  --secret-id health-watchers/production \
  --region us-east-1

# List versions
aws secretsmanager list-secret-version-ids \
  --secret-id health-watchers/production \
  --region us-east-1
```

### Manually rotate a secret immediately
```bash
aws secretsmanager rotate-secret \
  --secret-id health-watchers/production/mongo-password \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:ACCOUNT_ID:function:health-watchers-secret-rotation \
  --region us-east-1
```

### Check ESO sync status
```bash
kubectl describe externalsecret health-watchers-secrets -n health-watchers
# Look for: Ready: True and LastSyncTime
```

### Force ESO resync
```bash
kubectl annotate externalsecret health-watchers-secrets \
  -n health-watchers \
  force-sync=$(date +%s) --overwrite
```

### View Kubernetes secret keys (NOT values)
```bash
kubectl get secret health-watchers-secrets -n health-watchers -o json \
  | jq '.data | keys'
```

## Access Controls

All access to secrets follows least-privilege:

| Principal | Can Read | Can Write | Can Rotate |
|---|---|---|---|
| API pod (`health-watchers-sa`) | ✓ | ✗ | ✗ |
| Secret rotator CronJob (`secret-rotator`) | ✓ | ✗ | ✓ (via Lambda) |
| DevOps (break-glass) | ✓ | ✓ | ✓ |

RBAC is defined in `k8s/external-secrets-enhanced.yaml`.
IAM permissions are in `k8s/aws-secrets-manager-policy.json`.

## Audit Logging

### CloudTrail — AWS-side access log
```bash
# Search for who accessed a secret
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=health-watchers/production \
  --start-time $(date -d '-24 hours' --iso-8601=seconds) \
  --region us-east-1 \
  | jq '.Events[] | {time: .EventTime, user: .Username, action: .EventName}'
```

### Kubernetes Audit Log — k8s-side access log
```bash
# On the API server node
grep '"resource":"secrets"' /var/log/kubernetes/audit.log \
  | jq '{time: .requestReceivedTimestamp, user: .user.username, verb: .verb, name: .objectRef.name}'
```

### ESO Operator logs
```bash
kubectl logs -n external-secrets-system \
  -l app.kubernetes.io/name=external-secrets \
  --tail=100 | grep -i "health-watchers-secrets"
```

## Incident Response: Secret Compromised

**Severity: Critical — act within 15 minutes**

1. **Rotate immediately**
   ```bash
   aws secretsmanager rotate-secret \
     --secret-id health-watchers/production/<compromised-secret> \
     --force-delete-without-recovery \
     --region us-east-1
   ```

2. **Invalidate active sessions** (if JWT secret compromised)
   - Restart API pods to reload new JWT secret:
     ```bash
     kubectl rollout restart deployment/health-watchers-api -n health-watchers
     ```
   - Purge all active JWT tokens in the database:
     ```bash
     # Via API admin endpoint
     curl -X POST https://api.health-watchers.io/admin/revoke-all-tokens \
       -H "Authorization: Bearer <admin-token>"
     ```

3. **Audit who accessed the secret**
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=ResourceName,AttributeValue=health-watchers/production/<secret> \
     --start-time $(date -d '-7 days' --iso-8601=seconds) \
     --region us-east-1
   ```

4. **Notify security team**
   - Slack: `#security-alerts`
   - Email: `security@health-watchers.io`
   - Open incident in PagerDuty

5. **Document**
   - Log in the security incident tracker
   - Capture CloudTrail events as evidence
   - Perform post-mortem within 48 h

## Break-Glass Access

For emergency access when ESO is down:

```bash
# 1. Assume break-glass IAM role (requires MFA)
aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/health-watchers-break-glass \
  --role-session-name EmergencyAccess \
  --serial-number arn:aws:iam::ACCOUNT_ID:mfa/your-device \
  --token-code 123456

# 2. Set temporary credentials
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

# 3. Retrieve secret
aws secretsmanager get-secret-value \
  --secret-id health-watchers/production \
  --region us-east-1

# 4. Create Kubernetes secret manually (temporary)
kubectl create secret generic health-watchers-secrets-emergency \
  -n health-watchers \
  --from-literal=MONGO_URI='...' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Break-glass access is fully audited by CloudTrail and the k8s audit policy.

## Contacts

| Role | Contact |
|---|---|
| DevOps On-Call | PagerDuty rotation |
| Security Team | `security@health-watchers.io` |
| AWS Account Admin | `devops@health-watchers.io` |
