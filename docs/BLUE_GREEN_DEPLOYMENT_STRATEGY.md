# Blue-Green Deployment Strategy

Maintain two production-capable environments: blue and green.

## Flow

1. Deploy the new version to the idle environment.
2. Run smoke checks and migration compatibility checks.
3. Shift 10% of traffic, then 50%, then 100%.
4. Keep the previous environment warm for rollback.

Rollback by restoring traffic to the previous environment and freezing migrations that are not backward compatible.
