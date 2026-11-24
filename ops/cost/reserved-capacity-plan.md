# Reserved Capacity Plan (Savings Plans / RIs)

Purchasing plan for committed-use discounts. Reviewed monthly in the cost review
(see [`docs/COST_OPTIMIZATION.md`](../../docs/COST_OPTIMIZATION.md) §10).

## Principle

Commit to the **steady-state floor only** — the compute we run 24/7 regardless of
traffic — and leave the variable top layer on spot/on-demand. Target commitment
coverage **70–85% of the floor**. Never commit to 100%: a bad month of
right-sizing then leaves us paying for unused reservations.

## How the floor is measured

```bash
# 30-day p5 of total steady compute (vCPU-hours + GB-hours), from Cost Explorer /
# Prometheus. p5 ≈ "we were at least this big 95% of the time".
scripts/cost/cost-report.sh --months 2        # informs the number
```

Record the measured floor and the resulting commitment here each month:

| Month | Measured floor (vCPU) | Current commitment (vCPU-equiv) | Coverage | Utilization | Action |
|-------|-----------------------|--------------------------------|----------|-------------|--------|
| _template_ | 120 | 90 | 75% | 98% | hold |

## Instruments

| Layer | Instrument | Term | Payment | Notes |
|-------|-----------|------|---------|-------|
| EKS / EC2 compute floor | **Compute Savings Plan** | 1 year | No upfront | Flexible across instance family, size, region, and Fargate. Preferred. |
| MongoDB / Redis nodes (stable, `r`-family) | EC2 Instance Savings Plan or Standard RI | 1 year | No upfront | Only for nodes we are confident won't change family. |
| RDS (if introduced) | Reserved DB Instance | 1 year | No upfront | — |
| ElastiCache (if managed) | Reserved Cache Node | 1 year | No upfront | — |

Rules:

- **1-year, no-upfront only** until the platform footprint has been stable for
  two consecutive quarters. Re-evaluate 3-year for the genuinely immovable core.
- Stagger purchases (ladder) so commitments don't all expire in the same month.
- Buy in small increments (e.g. $0.50/hr SP tranches) and watch utilization for a
  week before the next tranche.
- Spot and DR warm-standby are **never** counted toward the floor.

## Monthly checklist

1. Pull Savings Plans utilization & coverage:
   `aws ce get-savings-plans-utilization` / `get-savings-plans-coverage-details`.
2. Utilization < 95%? → over-committed; do not buy more, let the tranche expire.
3. Coverage < 70% of floor and utilization ~100%? → buy one more tranche.
4. Any expiring in ≤ 30 days? → decide renew vs let-lapse based on current floor.
5. Update the table above and note the decision in `docs/COST_REVIEW_LOG.md`.

## Alerts

`monitoring/alerts-cost.yml`:

- `SavingsPlanUtilizationLow` — utilization < 95% for 3 days (paying for unused
  commitment).
- `SavingsPlanCoverageLow` — on-demand spend that *could* be covered exceeds 30%
  of the floor for 7 days (leaving discount on the table).
- `SavingsPlanExpiringSoon` — a commitment expires within 21 days.
