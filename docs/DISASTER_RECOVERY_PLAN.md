# Disaster Recovery Plan

## Overview

This document describes the disaster recovery (DR) strategy for the platform, including multi-region failover procedures, recovery targets, and validation steps. It is intended for on-call engineers, SREs, and incident commanders responding to a regional outage or data-integrity incident.

For data residency requirements and the multi-region architecture, see the deployment guide. This document focuses on the operational runbook for failover and failback.

---

## Recovery Targets

| Metric | Target | Description |
|--------|--------|-------------|
| **RPO** (Recovery Point Objective) | **5 minutes** | Maximum acceptable data loss measured in time. Cross-region replication lag must stay under this threshold. |
| **RTO** (Recovery Time Objective) | **15 minutes** | Maximum acceptable time to restore service in the secondary region after a declared disaster. |

These targets apply to the production environment. Staging and development environments have no formal DR targets.

---

## Region Definitions

| Role | Region | Purpose |
|------|--------|---------|
| **Primary** | `us-east-1` | Serves all production traffic under normal operation. Authoritative write region. |
| **Secondary (DR)** | `us-west-2` | Warm standby. Receives replicated data continuously. Promoted to primary during a failover. |

Both regions are within the United States to satisfy patient data residency requirements. No patient data is replicated outside the US.

---

## Prerequisites

Before executing any failover, confirm the following tooling is available and configured:

- `scripts/dr/failover.sh` — orchestrates cross-region promotion
- `scripts/dr/dr-drill.sh` — runs scheduled DR drills
- `scripts/dr/rpo-monitor.sh` — monitors replication lag against the RPO target
- `scripts/dr/rto-test.sh` — measures end-to-end recovery time
- `scripts/dr/verify-data-integrity.sh` — validates data consistency post-failover

All scripts require AWS credentials with cross-region permissions and access to the DR configuration (see `scripts/dr/README.md`).

---

## Monitoring and Pre-Failover Checks

### Continuous RPO Monitoring

`rpo-monitor.sh` runs continuously and alerts when replication lag approaches the 5-minute RPO. Before declaring a disaster, check current lag:

```bash
./scripts/dr/rpo-monitor.sh --status
```

If the primary region is degraded but reachable, allow replication to drain before failover to minimize data loss. If the primary is unreachable, proceed directly to failover — expect data loss up to the last confirmed replication point.

### Disaster Declaration Criteria

Declare a disaster and initiate failover when **any** of the following is true:

- Primary region is unavailable (AWS regional outage) for more than 5 minutes with no ETA.
- Primary database is corrupted or unrecoverable.
- A security incident requires isolating the primary region.
- Sustained replication lag indicates the secondary cannot meet RPO and the primary is at risk.

The incident commander makes the declaration. Document the decision and timestamp in the incident channel.

---

## Cross-Region Failover Procedure

### Step 1 — Declare and Communicate

1. Incident commander declares the disaster in the incident channel (`#incident-response`).
2. Notify stakeholders using the communication template below.
3. Assign a scribe to log every action with timestamps.

### Step 2 — Freeze and Snapshot

If the primary region is reachable:

```bash
# Stop writes to prevent divergence (put app in maintenance mode)
./scripts/dr/failover.sh --freeze-primary
```

If the primary is unreachable, skip this step.

### Step 3 — Execute Failover to DR Region

Promote the secondary region to primary:

```bash
./scripts/dr/failover.sh --to dr
```

This script performs, in order:

1. Verifies the secondary region's health and replication state.
2. Promotes the secondary database to a writable primary.
3. Updates DNS / traffic routing to direct traffic to the secondary region.
4. Scales up application capacity in the secondary region.
5. Runs a smoke test against the promoted region.

Monitor output for errors. If the script fails partway, do **not** re-run blindly — follow the rollback guidance printed by the script and escalate.

### Step 4 — Verify Data Integrity

After promotion, validate data consistency:

```bash
./scripts/dr/verify-data-integrity.sh --region us-west-2
```

Confirm:
- Row counts and checksums match the last known-good snapshot within expected replication lag.
- No orphaned or partially replicated records.
- Critical tables (patient records, audit logs) pass referential integrity checks.

### Step 5 — Measure RTO

Record actual recovery time:

```bash
./scripts/dr/rto-test.sh --report
```

Compare against the 15-minute RTO target and note any deviation in the incident record.

### Step 6 — Post-Failover Validation

Complete the following checklist before declaring service restored:

- [ ] Health checks green in the promoted region.
- [ ] Authentication and authorization functioning.
- [ ] Read and write paths verified with synthetic transactions.
- [ ] Audit logging confirmed writing to the new primary.
- [ ] Backups re-enabled and pointed at the new primary.
- [ ] Monitoring and alerting re-targeted to the promoted region.
- [ ] `rpo-monitor.sh` reconfigured to track replication from the new primary to the (now standby) old region.
- [ ] Data integrity verification passed.

### Step 7 — Communication

Send status updates at declaration, failover start, failover completion, and service restoration. Use the template:

```
[DR INCIDENT] <severity>
Status: <Investigating | Failover in progress | Service restored>
Primary region: us-east-1 (DOWN) → us-west-2 (ACTIVE)
Impact: <description>
RPO status: <within target | exceeded by X min>
RTO status: <within target | exceeded by X min>
Next update: <time>
```

---

## Failback Procedure

Failback returns traffic to the original primary region once it is healthy. Failback is a planned operation and should **not** be rushed during an active incident.

### Preconditions

- Original primary region is fully restored and stable for at least 1 hour.
- Replication from the current primary (secondary) back to the original primary is established and lag is under RPO.
- Change advisory approval obtained.

### Steps

1. Announce the planned failback window to stakeholders.
2. Confirm reverse replication is healthy:
   ```bash
   ./scripts/dr/rpo-monitor.sh --direction reverse --status
   ```
3. Execute failback:
   ```bash
   ./scripts/dr/failover.sh --failback
   ```
   This reverses the promotion: demotes the current primary, promotes the original region, and re-points traffic.
4. Verify data integrity in the restored primary:
   ```bash
   ./scripts/dr/verify-data-integrity.sh --region us-east-1
   ```
5. Run post-failover validation checklist (Step 6 above) against the restored primary.
6. Re-establish forward replication to the secondary region.
7. Confirm `rpo-monitor.sh` shows healthy forward replication.
8. Close the incident and schedule a post-incident review.

---

## DR Drills

Regular drills validate that RTO/RPO targets are achievable and that the runbook is current.

### Monthly Drills

```bash
./scripts/dr/dr-drill.sh --scope monthly
```

Monthly drills cover:
- Replication lag verification against RPO.
- Read-only failover simulation (no traffic cutover).
- Validation of backup restore in the secondary region.

### Quarterly Drills

```bash
./scripts/dr/dr-drill.sh --scope quarterly
```

Quarterly drills are full-scale and include:
- Complete failover to the secondary region with traffic cutover.
- Full RTO measurement via `rto-test.sh`.
- Data integrity verification via `verify-data-integrity.sh`.
- Failback to the primary region.
- Review and update of this runbook based on findings.

Document drill results and any runbook gaps. File follow-up issues for any target misses.

---

## Roles and Responsibilities

| Role | Responsibility |
|------|----------------|
| Incident Commander | Declares disaster, approves failover/failback, owns communication. |
| DR Operator | Executes scripts, monitors output, reports status. |
| Scribe | Logs all actions and timestamps. |
| Data Integrity Lead | Runs and interprets integrity verification. |
| Communications Lead | Sends stakeholder updates. |

---

## Appendix: Quick Reference

```bash
# Check replication lag / RPO status
./scripts/dr/rpo-monitor.sh --status

# Freeze primary writes (if reachable)
./scripts/dr/failover.sh --freeze-primary

# Fail over to DR region
./scripts/dr/failover.sh --to dr

# Verify data integrity in promoted region
./scripts/dr/verify-data-integrity.sh --region us-west-2

# Measure RTO
./scripts/dr/rto-test.sh --report

# Fail back to original primary
./scripts/dr/failover.sh --failback

# Run drills
./scripts/dr/dr-drill.sh --scope monthly
./scripts/dr/dr-drill.sh --scope quarterly