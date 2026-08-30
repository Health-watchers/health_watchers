# Runbook: Region Failover

**Use when:** the primary region (`us-east-1`) is unavailable or degraded beyond
the RTO — control-plane outage, AZ-wide failure, network partition.
**Objective:** RTO 30 min, RPO 5 min.
**Owner:** DevOps on-call + Engineering Lead (dual-control for the DNS cutover).

> Automation: [`scripts/dr/failover.sh`](../../scripts/dr/failover.sh).
> Failback is the same script with `--failback`.

## Preconditions

- DR region (`eu-west-1`) runs a warm-standby stack (0–1 replicas) and a MongoDB
  secondary that is a member of the production replica set.
- Route 53 record for `app.health-watchers.io` is a CNAME with 60 s TTL (or a
  failover record set with health checks).
- `PRIMARY_CONTEXT`, `DR_CONTEXT`, `ROUTE53_ZONE_ID`, `DR_MONGO_URI` are set.

## Decision gate

Fail over only if **all** hold:

1. Primary API `/health` has been non-200 for > 10 min from two external probes.
2. The cause is regional (confirmed on the cloud status page or by support), not
   an app bug that would follow us to the DR region.
3. Engineering Lead (or delegate) approves — this is a customer-visible action.

## Execute

```bash
# 1. Dry run first — confirms context reachability and the planned changes
scripts/dr/failover.sh --to dr --dry-run --reason "us-east-1 control plane outage"

# 2. Live
scripts/dr/failover.sh --to dr --reason "us-east-1 control plane outage"
```

The script: fences the source, promotes the DR MongoDB member to primary
(`rs.reconfig` with raised priority), scales the DR deployments up, repoints
Route 53 and the CDN origin, purges the CDN cache, then runs health + integrity
checks. It writes `dr_failover_seconds`.

If `--skip-dns` was used or DNS could not be updated automatically:

```bash
aws route53 change-resource-record-sets --hosted-zone-id $ROUTE53_ZONE_ID \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{
    "Name":"app.health-watchers.io","Type":"CNAME","TTL":60,
    "ResourceRecords":[{"Value":"<dr-alb-hostname>"}]}}]}'
```

## Verify

- `curl -fsS https://app.health-watchers.io/health` and `/api/health` → 200
- `scripts/dr/verify-data-integrity.sh --uri "$DR_MONGO_URI"` → exit 0
- Synthetic login + create-encounter smoke test passes
- Error rate and latency on the DR dashboard within normal bounds for 15 min

## Communicate

Post "Identified — failing over to secondary region" then "Monitoring" then
"Resolved" updates ([`../templates/INCIDENT_COMMUNICATION.md`](../templates/INCIDENT_COMMUNICATION.md)).
State the RPO actually achieved (data-loss window) if any.

## Failback

Do **not** rush. Once the primary region is healthy for ≥ 2 h:

```bash
# resync: primary MongoDB member catches up from the (now-primary) DR member
scripts/dr/failover.sh --failback --dry-run
scripts/dr/failover.sh --failback
```

Schedule failback in a low-traffic window; it is a second customer-visible cutover.

## Post-incident

- Post-mortem within 48 h.
- Update `docs/DR_DRILL_LOG.md` with measured RTO/RPO.
- Review whether warm-standby capacity was sufficient; adjust
  `helm/health-watchers/values-production.yaml` DR replica floors if not.
