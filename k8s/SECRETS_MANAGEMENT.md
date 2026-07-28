# Secrets Management Guide

This document describes the secure secrets management system for Health Watchers.

## Architecture

### Components
1. AWS Secrets Manager - Central secret storage
2. External Secrets Operator (ESO) - Synchronizes secrets to Kubernetes
3. Kubernetes Secrets - Read-only copies synced from AWS
4. AWS CloudTrail - Audit logging

## Secret Types and Rotation

### Database Credentials
- Rotation: 30 days
- Stored in: `health-watchers/production/mongo-*`
- Process: Password rotated, new user created

### JWT Secrets
- Rotation: 90 days
- Stored in: `health-watchers/production/jwt-*`
- Process: New key created with 24h grace period

### Stellar Keys
- Rotation: 180 days or manual
- Stored in: `health-watchers/production/stellar-*`
- Note: Requires on-chain updates

### API Keys
- Rotation: 60 days
- Stored in: `health-watchers/production/api-keys-*`

## Setup

See external-secrets-enhanced.yaml for deployment configuration.

Key steps:
1. Create AWS IAM role with IRSA
2. Attach secrets access policy
3. Deploy ESO configuration
4. Populate initial secrets in AWS
5. Configure automatic rotation

## Best Practices

1. **Principle of Least Privilege** - Grant access only as needed
2. **Automatic Rotation** - Use automated rotation where possible
3. **Audit Logging** - Monitor all secret access
4. **Never Commit** - Keep secrets out of Git
5. **Emergency Procedures** - Test break-glass access quarterly

## Troubleshooting

Check ExternalSecret status:
```bash
kubectl describe externalsecret health-watchers-secrets -n health-watchers
```

View rotation history:
```bash
aws secretsmanager describe-secret --secret-id health-watchers/production
```

Check ESO logs:
```bash
kubectl logs -n external-secrets-system -l app=external-secrets
```

## Security Incident Response

If secret compromised:
1. Rotate immediately
2. Audit access logs in CloudTrail
3. Review who accessed it
4. Notify security and application teams
5. Strengthen controls

For issues contact: devops@health-watchers.io
