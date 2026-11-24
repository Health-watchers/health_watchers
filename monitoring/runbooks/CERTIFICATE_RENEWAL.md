# Certificate Renewal Runbook

## Overview

TLS certificates for the Health Watchers cluster are issued and renewed
automatically by [cert-manager](https://cert-manager.io/) using Let's Encrypt
(ACME v02) with the HTTP-01 solver.

| Item | Value |
| --- | --- |
| Issuer | `letsencrypt-prod` (ClusterIssuer, ACME v02) |
| Solver | `http01` via ingress class `nginx` |
| Certificate | `health-watchers-cert` (namespace `health-watchers`) |
| Secret | `health-watchers-tls` |
| Renewal window | `renewBefore: 720h` (30 days before expiry) |
| Manifest | `k8s/cert-manager-setup.yaml` |

cert-manager renews the certificate automatically once it enters the renewal
window. This runbook covers what to do when that does not happen.

## Architecture

```
Let's Encrypt ACME v02
        │  (HTTP-01 challenge)
        ▼
   cert-manager  ──►  Certificate health-watchers-cert
        │                     │
        │                     ▼
        │            Secret health-watchers-tls
        │                     │
        ▼                     ▼
  Challenge / Order      Ingress (nginx) ──► clients
```

## Operations

### Inspect certificate state

```bash
kubectl get certificate -n health-watchers
kubectl describe certificate health-watchers-cert -n health-watchers
```

`Ready` should be `True` and `Renewal Time` should be in the future.

### Inspect the ACME request chain

```bash
kubectl get certificaterequest,order,challenge -n health-watchers
kubectl describe challenge -n health-watchers
```

### Check the certificate actually served

```bash
kubectl get secret health-watchers-tls -n health-watchers \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates
```

### Force a renewal

```bash
cmctl renew health-watchers-cert -n health-watchers
# or, without cmctl:
kubectl delete secret health-watchers-tls -n health-watchers
```

cert-manager will re-issue the certificate and recreate the secret.

## Incident Response: renewal failure

1. **Confirm the failure** — `CertificateExpiry30Days`, `CertificateExpiry7Days`,
   `CertificateExpiryImmediate` or `CertificateRenewalFailed` firing.
2. **Check cert-manager controller logs**

   ```bash
   kubectl logs -n cert-manager -l app=cert-manager --tail=200
   ```

3. **Check ACME rate limits** — Let's Encrypt enforces
   [rate limits](https://letsencrypt.org/docs/rate-limits/). Repeated failed
   attempts can lock issuance for a week. Do not loop `cmctl renew`.
4. **Check HTTP-01 reachability** — the challenge requires
   `http://<domain>/.well-known/acme-challenge/<token>` to be reachable from the
   internet. Verify DNS points at the ingress load balancer and that the ingress
   class is `nginx`.
5. **Check the ingress annotation** — the ingress must carry
   `cert-manager.io/cluster-issuer: letsencrypt-prod`.
6. **Manual renewal** — once the root cause is fixed, run `cmctl renew` (above)
   and watch `kubectl get certificate -n health-watchers -w`.
7. **Rollback** — if a bad certificate is served, restore the previous secret
   from backup or re-apply the last known-good `health-watchers-tls` secret, then
   re-run the renewal.

## Testing renewal in staging

Automatic renewal cannot be exercised in production without waiting 60 days.
In staging:

1. Apply a staging `Certificate` with a short lifetime, e.g.
   `duration: 24h` and `renewBefore: 12h` (or point at a staging Issuer).
2. Watch cert-manager renew it:

   ```bash
   kubectl get certificate -n health-watchers -w
   kubectl get secret health-watchers-tls -n health-watchers \
     -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates
   ```

3. Confirm the expiry timestamp advances and `Ready` returns to `True`.
4. Revert the staging Certificate to the production values (`renewBefore: 720h`).

## Alerts

| Alert | Condition | Severity |
| --- | --- | --- |
| `CertificateExpiry30Days` | expires in < 30 days | warning |
| `CertificateExpiry7Days` | expires in < 7 days | warning |
| `CertificateExpiryImmediate` | expires in < 24 hours | critical |
| `CertificateRenewalFailed` | renewal failures / not Ready | critical |

## Contacts

| Role | Contact |
| --- | --- |
| DevOps on-call | PagerDuty `health-watchers-platform` |
| Security | security@health-watchers.io |
