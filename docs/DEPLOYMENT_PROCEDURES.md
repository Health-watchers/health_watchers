# Deployment Procedures

## Preflight

- Confirm migrations are backward compatible.
- Confirm secrets are present in the target environment.
- Review monitoring and rollback owner.

## Deploy

1. Build and publish immutable images.
2. Apply infrastructure changes.
3. Deploy API, workers, web, and Stellar service.
4. Run smoke checks.
5. Watch latency, error rate, and audit-event flow for 30 minutes.
